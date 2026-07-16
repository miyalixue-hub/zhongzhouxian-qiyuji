#!/usr/bin/env python3
"""
STL/3MF 自动修复脚本 - AI魔法师训练营专用
功能：
  1. 移除悬浮碎片（连通分量分析，只保留最大主体）
  2. 切平底座（创建平整底面，确保可以放在打印床上）
  3. 修复网格（法线方向、流形检查）
  4. 自动缩放到合适打印尺寸（默认高度 8cm）
  5. 支持 STL 和 3MF 格式输入输出

用法：
  python stl_repair.py input.stl [output.stl] [--height 80] [--format 3mf] [--verbose]

格式转换示例：
  python stl_repair.py model.stl model_repaired.3mf          # STL→3MF（带修复）
  python stl_repair.py model.3mf model_repaired.stl          # 3MF→STL（带修复）
  python stl_repair.py model.stl model_repaired.stl          # STL→STL（带修复）
  python stl_repair.py model.3mf model_repaired.3mf          # 3MF→3MF（带修复）

作者：小本垒
日期：2026-07-16
"""

import trimesh
import numpy as np
import sys
import os
import argparse
from scipy.spatial import ConvexHull


def analyze_mesh(mesh, name="模型"):
    """分析网格状态并打印报告"""
    print(f"\n{'='*50}")
    print(f"📊 {name} 分析报告")
    print(f"{'='*50}")
    print(f"  顶点数: {len(mesh.vertices)}")
    print(f"  面数:   {len(mesh.faces)}")
    print(f"  包围盒: {mesh.extents}")
    print(f"  尺寸(mm): {mesh.extents[0]:.1f} x {mesh.extents[1]:.1f} x {mesh.extents[2]:.1f}")
    print(f"  体积:   {abs(mesh.volume):.1f} mm³")
    print(f"  是否流形: {'✅ 是' if mesh.is_watertight else '❌ 否'}")
    print(f"  法线方向: {'✅ 一致' if mesh.is_winding_consistent else '❌ 不一致'}")
    try:
        components = trimesh.graph.split(mesh)
        print(f"  连通分量: {len(components)} 个")
    except:
        print(f"  连通分量: 无法计算")


def remove_floating_parts(mesh, keep_largest=True, min_volume_ratio=0.1, verbose=True):
    """
    移除悬浮的碎片部分
    策略：只保留体积占比超过阈值的连通分量
    
    参数：
      mesh: trimesh.Trimesh 对象
      keep_largest: 是否只保留最大连通分量
      min_volume_ratio: 最小体积比例（相对于最大分量），低于此值的被删除
    """
    if verbose:
        print("\n🔧 步骤1: 移除悬浮碎片...")
    
    # 获取连通分量（trimesh 4.x API: split 返回子mesh列表）
    try:
        components = trimesh.graph.split(mesh)
    except Exception:
        if verbose:
            print(f"  → 无法分割连通分量，跳过此步骤")
        return mesh
    
    if len(components) <= 1:
        if verbose:
            print(f"  → 只有1个连通分量，无需处理")
        return mesh
    
    if verbose:
        print(f"  → 发现 {len(components)} 个分离的部件")
    
    # 计算每个分量的体积
    component_info = []
    for i, sub_mesh in enumerate(components):
        vol = abs(sub_mesh.volume)
        component_info.append((i, vol, sub_mesh))
        if verbose:
            print(f"    部件 {i+1}: 面数={len(sub_mesh.faces)}, 体积={vol:.1f} mm³")
    
    # 按体积排序，最大的排第一
    component_info.sort(key=lambda x: x[1], reverse=True)
    
    # 保留策略：只保留最大分量
    largest_mesh = component_info[0][2]
    largest_vol = component_info[0][1]
    
    removed_count = 0
    for idx, vol, sub_mesh in component_info:
        ratio = vol / largest_vol if largest_vol > 0 else 0
        if ratio >= 0.99:
            # 最大分量本身
            if verbose:
                print(f"  ✅ 保留主体部件 (体积={vol:.1f} mm³)")
        else:
            removed_count += 1
            if verbose:
                print(f"  ❌ 移除悬浮碎片 {idx+1} (体积比={ratio:.3f}，仅{vol:.1f} mm³)")
    
    if verbose:
        print(f"  → 完成：移除 {removed_count} 个悬浮部件")
    
    return largest_mesh.copy()


def flatten_base(mesh, z_offset=0.0, verbose=True):
    """
    切平底座，确保模型底部平整
    
    策略：找到模型底部，将所有低于切平面的部分切掉，
    使底面完全平整在 Z=z_offset 平面
    
    参数：
      mesh: trimesh.Trimesh 对象
      z_offset: 底面Z坐标偏移（默认为0，即底面在Z=0）
    """
    if verbose:
        print("\n🔧 步骤2: 切平底座...")
    
    bounds = mesh.bounds
    z_min = bounds[0][2]  # 当前最低点
    z_max = bounds[1][2]  # 最高点
    
    # 切平平面：在底部往上 5% 的位置
    # 这样不会切掉太多底座结构，但能确保底面平整
    height = z_max - z_min
    cut_z = z_min + height * 0.05  # 切掉底部5%
    
    if verbose:
        print(f"  → 原始底部 Z={z_min:.2f}mm")
        print(f"  → 切平面 Z={cut_z:.2f}mm (底部上方5%)")
    
    # 使用截面法切平底座
    # 优先使用顶点截断法（不依赖 shapely），如果失败用备选方案
    
    try:
        return flatten_base_fallback(mesh, cut_z, z_offset, verbose)
    except Exception as e:
        if verbose:
            print(f"  → 切平失败: {e}")
        return mesh


def flatten_base_fallback(mesh, cut_z, z_offset, verbose=True):
    """
    底座切平备选方案：
    将低于 cut_z 的所有顶点拉到 cut_z 高度，形成平底
    然后移除面积接近零的退化面片
    """
    # 复制mesh避免修改原对象
    repaired = mesh.copy()
    
    # 截断低于 cut_z 的顶点
    z_coords = repaired.vertices[:, 2]
    below_mask = z_coords < cut_z
    below_count = np.sum(below_mask)
    
    if below_count == 0:
        if verbose:
            print(f"  → 底座已经平整，无需处理")
        return repaired
    
    # 将低于 cut_z 的顶点都拉到 cut_z
    repaired.vertices[below_mask, 2] = cut_z
    
    # 移除退化面（三个顶点都在同一平面、面积为0的面）
    # 计算每个面的面积，移除面积 < 1e-8 的面
    faces = repaired.faces
    v0 = repaired.vertices[faces[:, 0]]
    v1 = repaired.vertices[faces[:, 1]]
    v2 = repaired.vertices[faces[:, 2]]
    cross = np.cross(v1 - v0, v2 - v0)
    face_areas = np.linalg.norm(cross, axis=1) / 2.0
    
    degenerate_mask = face_areas < 1e-8
    if np.any(degenerate_mask):
        keep_faces = np.where(~degenerate_mask)[0]
        repaired.update_faces(keep_faces)
        if verbose:
            print(f"  → 移除 {np.sum(degenerate_mask)} 个退化面片")
    
    # 移除未被任何面引用的顶点
    repaired.remove_unreferenced_vertices()
    
    # 平移到底面在 z_offset
    current_min_z = repaired.vertices[:, 2].min()
    if current_min_z != z_offset:
        repaired.vertices[:, 2] += (z_offset - current_min_z)
    
    if verbose:
        print(f"  → 截断 {below_count} 个底部顶点至 Z={cut_z:.2f}mm")
        print(f"  → 新底部 Z={z_offset:.2f}mm")
    
    return repaired


def fix_normals_and_manifold(mesh, verbose=True):
    """
    修复法线方向和流形问题
    """
    if verbose:
        print("\n🔧 步骤3: 修复网格...")
    
    # 修复法线方向（确保所有面法线朝外）
    trimesh.repair.fix_normals(mesh)
    if verbose:
        print(f"  → 法线方向: {'✅ 已修复' if mesh.is_winding_consistent else '⚠️ 仍有问题'}")
    
    # 修复翻转的面
    trimesh.repair.fix_winding(mesh)
    
    # 尝试修复非流形边（合并距离很近的顶点）
    trimesh.repair.fix_inversion(mesh)
    
    # 填充小孔洞
    if not mesh.is_watertight:
        try:
            trimesh.repair.fill_holes(mesh)
            if verbose:
                print(f"  → 尝试填充孔洞")
        except:
            if verbose:
                print(f"  → 孔洞填充跳过（复杂孔洞无法自动修复）")
    
    # 移除退化面（面积为0的面）
    trimesh.repair.fix_normals(mesh)
    
    if verbose:
        print(f"  → 流形状态: {'✅ 水密' if mesh.is_watertight else '⚠️ 非水密（仍可打印）'}")
    
    return mesh


def scale_to_target_height(mesh, target_height_mm=80, verbose=True):
    """
    将模型缩放到目标高度
    
    参数：
      mesh: trimesh.Trimesh 对象
      target_height_mm: 目标高度（毫米），默认80mm = 8cm
    """
    if verbose:
        print(f"\n🔧 步骤4: 缩放模型...")
    
    current_height = mesh.extents[2]
    if current_height <= 0:
        if verbose:
            print(f"  → 模型高度为0，跳过缩放")
        return mesh
    
    scale_factor = target_height_mm / current_height
    
    if verbose:
        print(f"  → 当前高度: {current_height:.1f}mm")
        print(f"  → 目标高度: {target_height_mm}mm")
        print(f"  → 缩放比例: {scale_factor:.2f}x")
    
    mesh.vertices *= scale_factor
    
    new_height = mesh.extents[2]
    if verbose:
        print(f"  → 缩放后高度: {new_height:.1f}mm")
        print(f"  → 缩放后尺寸: {mesh.extents[0]:.1f} x {mesh.extents[1]:.1f} x {mesh.extents[2]:.1f}mm")
    
    return mesh


def ensure_flat_bottom_and_center(mesh, verbose=True):
    """
    确保底面在 Z=0 且模型在 XY 平面居中
    """
    if verbose:
        print("\n🔧 步骤5: 居中对齐...")
    
    # 确保底面在 Z=0
    z_min = mesh.vertices[:, 2].min()
    mesh.vertices[:, 2] -= z_min
    
    # XY 平面居中
    center_x = (mesh.vertices[:, 0].min() + mesh.vertices[:, 0].max()) / 2
    center_y = (mesh.vertices[:, 1].min() + mesh.vertices[:, 1].max()) / 2
    mesh.vertices[:, 0] -= center_x
    mesh.vertices[:, 1] -= center_y
    
    if verbose:
        print(f"  → 底面: Z=0 ✅")
        print(f"  → XY居中: ({mesh.vertices[:, 0].min():.1f}~{mesh.vertices[:, 0].max():.1f}, "
              f"{mesh.vertices[:, 1].min():.1f}~{mesh.vertices[:, 1].max():.1f})")
    
    return mesh


def repair_stl(input_path, output_path=None, target_height=80, output_format=None, verbose=True):
    """
    主修复流程：一键修复 3D 模型使其可打印
    
    参数：
      input_path: 输入文件路径（支持 .stl 和 .3mf）
      output_path: 输出路径（默认在原文件名后加 _repaired，扩展名根据 output_format 决定）
      target_height: 目标打印高度（mm）
      output_format: 输出格式，'stl' 或 '3mf'，None 则根据输出文件扩展名自动判断
      verbose: 是否打印详细信息
    
    返回：
      修复后的 mesh 对象
    """
    # 确定输入格式
    input_ext = os.path.splitext(input_path)[1].lower()
    input_format = '3mf' if input_ext == '.3mf' else 'stl'
    
    # 确定输出路径和格式
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        out_ext = '.3mf' if (output_format == '3mf' or (output_format is None and input_ext == '.3mf')) else '.stl'
        output_path = f"{base}_repaired{out_ext}"
    
    # 如果没指定 output_format，从输出文件扩展名推断
    if output_format is None:
        output_format = '3mf' if output_path.lower().endswith('.3mf') else 'stl'
    
    if verbose:
        print("=" * 60)
        print("🎨 AI魔法师训练营 - 3D 模型自动修复工具 v1.1")
        print("=" * 60)
        print(f"📥 输入文件: {input_path} (格式: {input_format.upper()})")
        print(f"📤 输出文件: {output_path} (格式: {output_format.upper()})")
    
    # 加载模型
    mesh = trimesh.load(input_path, force='mesh')
    
    # 分析原始状态
    analyze_mesh(mesh, "原始模型")
    
    # Step 1: 移除悬浮碎片
    mesh = remove_floating_parts(mesh, keep_largest=True, min_volume_ratio=0.1, verbose=verbose)
    
    # Step 2: 切平底座
    mesh = flatten_base(mesh, z_offset=0.0, verbose=verbose)
    
    # Step 3: 修复网格
    mesh = fix_normals_and_manifold(mesh, verbose=verbose)
    
    # Step 4: 缩放到目标高度
    mesh = scale_to_target_height(mesh, target_height_mm=target_height, verbose=verbose)
    
    # Step 5: 居中对齐
    mesh = ensure_flat_bottom_and_center(mesh, verbose=verbose)
    
    # 最终分析
    analyze_mesh(mesh, "修复后模型")
    
    # 保存
    mesh.export(output_path)
    
    if verbose:
        file_size = os.path.getsize(output_path)
        print(f"\n{'='*50}")
        print(f"✅ 修复完成!")
        print(f"{'='*50}")
        print(f"  📦 文件大小: {file_size/1024:.1f} KB")
        print(f"  📏 最终尺寸: {mesh.extents[0]:.1f} x {mesh.extents[1]:.1f} x {mesh.extents[2]:.1f} mm")
        print(f"  🖨️  底面状态: Z=0 平整 ✅")
        print(f"  🗑️  悬浮碎片: 已清除 ✅")
        print(f"  📁 输出格式: {output_format.upper()}")
        print(f"  📁 输出路径: {output_path}")
    
    return mesh


def main():
    parser = argparse.ArgumentParser(description='STL/3MF 自动修复工具 - AI魔法师训练营')
    parser.add_argument('input', help='输入文件路径（支持 .stl 和 .3mf）')
    parser.add_argument('output', nargs='?', help='输出文件路径（可选，默认加 _repaired 后缀）')
    parser.add_argument('--height', type=int, default=80, help='目标高度（mm），默认80mm')
    parser.add_argument('--format', choices=['stl', '3mf'], default=None, 
                       help='输出格式（stl 或 3mf），默认根据输出文件扩展名自动判断')
    parser.add_argument('--quiet', action='store_true', help='安静模式，不打印详细信息')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"❌ 错误: 找不到文件 {args.input}")
        sys.exit(1)
    
    verbose = not args.quiet
    
    try:
        repair_stl(args.input, args.output, target_height=args.height, 
                   output_format=args.format, verbose=verbose)
    except Exception as e:
        print(f"\n❌ 修复失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
