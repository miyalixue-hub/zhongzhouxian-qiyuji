# Codex 协作开发注意事项

> 本文档基于 2026-07-14 ~ 07-15 两天合并调试中遇到的实际问题整理，供 Codex 后续开发参考。

---

## 一、项目基本信息

- **项目名称**：中轴奇游记（zhongzhouxian-qiyuji）
- **GitHub 仓库**：https://github.com/miyalixue-hub/zhongzhouxian-qiyuji
- **线上地址**：https://mindbubble.cloud（Cloudflare Pages 部署，项目名 zhongzhouxian-qiyoji）
- **目标用户**：6-12 岁儿童
- **技术栈**：纯前端（HTML + CSS + JavaScript），无框架，无构建工具

---

## 二、代码合并红线规则

### 2.1 禁止删除已有页面结构

项目中 `index.html` 包含 **13 个主页面**（page-0 至 page-12）+ 多个辅助页面（page-4a/4b/4c、oracle-screen、splash-screen）。每个页面都是完整的流程节点，**删除任何一个都会导致用户流程断裂**。

合并代码时，如果新旧版本页面 ID 不一致，**必须逐个核对页面完整性**，不能直接覆盖整个文件。

**本次事故**：合并后 page-10（候选图选择）、page-11（3D 模型工坊）、page-12（完成页）整个 HTML 结构丢失，导致"生成 2D"后直接空白页。

### 2.2 保持 div 标签配对平衡

每次修改后，必须验证 `<div>` 开标签和闭标签数量一致。本次修复时确认当前版本为 **571 对 571**。不平衡会导致后续所有页面结构坍塌。

### 2.3 禁止重复 ID

整个 HTML 中，**每个 id 属性值必须全局唯一**。本次发现 `btn-back-9` 在 page-9 和 page-11 中各出现一次，导致 JS 事件绑定错乱。

修改前用全文搜索确认目标 ID 是否已存在。

### 2.4 JS 文件版本号必须更新

每次修改 JS 文件后，**必须同步更新 `index.html` 中对应的版本号查询参数**，否则用户浏览器会使用缓存的旧版本。

版本号格式：`js/xxx.js?v=20260715b`（日期+字母序号）

当前版本映射：
| 文件 | 版本号 |
|------|--------|
| interactions.js | ?v=20260715b |
| core.js | ?v=20260715a |
| ai-generate.js | ?v=20260714c |
| meshy-3d.js | ?v=20260713b |
| home-story.js | ?v=20260714d |
| home-story-config.js | ?v=20260714b |
| patrol-game.js | ?v=20260713b |

---

## 三、CSS 注意事项

### 3.1 `!important` 覆盖问题

`styles/main.css` 中多处使用了 `!important`，典型的是 `.showing` 类：

```css
#oracle-screen.showing {
    display: flex !important;
    position: fixed !important;
    z-index: 100000 !important;
}
```

**这意味着**：如果 JS 中通过 `element.style.display = 'none'` 设置内联样式，**无法覆盖** `!important`。必须同时移除 `.showing` 类才能隐藏元素。

**本次事故**：`hideOracleScreen()` 只设了 `display:none`，没移除 `.showing` 类，导致签筒弹出后无法关闭，后续按钮全部被遮挡。

**正确做法**：
```javascript
function hideOracleScreen() {
    const screen = document.getElementById('oracle-screen');
    screen.classList.remove('showing');  // 必须移除 !important 的类
    screen.style.display = 'none';
}
```

### 3.2 CSS 文件是 binary 格式

`styles/main.css` 含有非 UTF-8 字符（可能是 BOM 或特殊编码），**不能用普通文本编辑器直接修改**。需要用 Python 处理：

```python
with open('styles/main.css', 'rb') as f:
    content = f.read()
# 修改后
with open('styles/main.css', 'wb') as f:
    f.write(content)
```

---

## 四、JavaScript 注意事项

### 4.1 事件绑定方式

当前项目混用了多种事件绑定方式：
- HTML inline `onclick` 属性（最可靠，优先级最高）
- `addEventListener`（在 DOMContentLoaded 中）
- 直接赋值 `element.onclick = ...`

**如果某个按钮点击无响应**，优先尝试添加 inline onclick 属性绕过 JS 事件绑定问题。这是本次调试中最终解决 `btn-view-prompt` 的方法。

### 4.2 页面跳转机制

所有页面切换通过 `core.js` 中的 `showPage(pageNumber)` 函数统一控制。流程如下：

1. 隐藏当前页面（移除 `.showing` 类）
2. 显示目标页面（添加 `.showing` 类）
3. 触发目标页面的初始化逻辑

**不要直接操作页面显示/隐藏**，统一走 `showPage()`。

### 4.3 函数重复定义

`interactions.js` 中存在同名函数的多处定义（如 `showTramPromptPage`、`hideOracleScreen`），分布在全局作用域和 `DOMContentLoaded` 闭包内。目前不冲突但增加维护难度，**修改时注意改对所有位置**。

---

## 五、页面流程与架构

### 5.1 完整用户流程

```
首页(page-0) → 故事线(1→2→3→4→5) → 选择站(4a→4b→4c) 
→ 正阳门(7→8→9) → 抽签(oracle-screen) → 确认提示词(9) 
→ 生成2D(10) → 选图(10→11) → 3D工坊(11) → 完成分享(12)
```

### 5.2 关键按钮与页面映射

| 按钮 ID | 所在页面 | 功能 | 跳转到 |
|---------|---------|------|--------|
| btn-next-6 | page-8 | 抽取天赋签 | oracle-screen |
| btn-view-prompt | oracle-screen | 查看提示词 | （弹窗显示） |
| btn-generate | page-9 | 生成专属神兽 | page-10 |
| btn-confirm-image | page-10 | 选好了进入3D | page-11 |
| btn-home-p9 | page-11 | 去保存和分享 | page-12 |

### 5.3 特殊页面说明

- **oracle-screen**：浮层式弹窗，通过 `.showing` 类控制显隐，不是常规页面流转
- **page-4a/4b/4c**：选择站的三个分支页面
- **splash-screen**：开屏动画，自动消失

---

## 六、合并代码的标准流程

以后如果再需要合并不同版本的代码，**必须按以下流程执行**：

1. **合并前备份**：将当前完整工程复制到带时间戳的备份目录
2. **逐文件对比**：不要整体覆盖，逐文件对比差异
3. **结构验证**：合并后立即验证
   - div 标签配对数量一致
   - script 标签配对数量一致
   - 所有页面 ID（page-0 到 page-12）均存在
   - 无重复 ID
4. **流程验证**：按完整用户流程逐页点击测试
5. **版本号更新**：所有修改过的 JS 文件更新版本号
6. **提交推送**：确认无误后 git commit + push

---

## 七、Git 操作规范

- 每次修改前先 `git pull`
- 重大修改前先创建备份目录（格式：`zhongzhouxian-work-backup-YYYYMMDDHHMM`）
- commit message 用中文简明描述修改内容
- **禁止将游戏设计文件上传到 GitHub**（项目仓库只放代码，不放设计文档）

---

## 八、已知遗留问题

- 2D 图片生成速度较慢（API 响应时间问题，非代码问题）
- `interactions.js` 中有冗余的重复函数定义（无害，可在后续版本清理）

---

*本文档由小本垒整理，基于 2026-07-14 ~ 07-15 实际调试经验。如有更新请及时同步。*
