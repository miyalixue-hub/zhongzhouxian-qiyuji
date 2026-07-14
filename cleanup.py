#!/usr/bin/env python3
"""
Cleanup script: Remove all expression (表情) related code from the zhongzhouxian project.
This removes the hidden page-6 (姿态表情) step entirely.
"""

import re
import os

BASE = '/app/data/所有对话/主对话/教案文档/zhongzhouxian-work'

# ============================================================
# 1. index.html cleanup
# ============================================================
def cleanup_index_html():
    path = os.path.join(BASE, 'index.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    new_lines = []
    skip_until = -1  # line number to skip until (inclusive)
    
    for i, line in enumerate(lines):
        line_num = i + 1  # 1-based
        
        # Skip the entire page-6 section (from "Page 4: Step 3 姿态表情" comment to its closing div)
        # Find the start: "<!-- Page 4: Step 3 姿态表情 -->"
        if '<!-- Page 4: Step 3 姿态表情 -->' in line:
            # We need to skip from here until the closing </div> of page-6
            # Find the <div class="page-section" id="page-6"> start
            skip_until = -1
            depth = 0
            found_start = False
            for j in range(i, len(lines)):
                if 'id="page-6"' in lines[j]:
                    found_start = True
                    depth = 0
                if found_start:
                    depth += lines[j].count('<div') - lines[j].count('</div')
                    if depth <= 0 and j > i:
                        skip_until = j
                        break
            # Also skip the comment line itself
            new_lines.append('')  # Replace with empty line
            continue
        
        if skip_until >= 0 and i <= skip_until:
            continue
        
        # Remove recipe-tag with data-step="face"
        if 'data-step="face"' in line and 'recipe-tag' in line:
            continue
        
        # Remove "姿态表情" progress-step blocks (6-step progress bars → 5 steps)
        # We need to identify and remove the "姿态表情" progress-step div in progress bars
        # These appear as multi-line blocks like:
        #   <div class="progress-step">
        #       <div class="progress-circle ...">N</div>
        #       <div class="progress-label ...">姿态表情</div>
        #   </div>
        # We'll handle this with a post-processing regex instead
        
        # Update step indicators: 步骤X/5 → 步骤X/4 with renumbering
        # page-4: 步骤1/5 → 步骤1/4
        # page-5: 步骤2/5 → 步骤2/4  
        # page-7: 步骤4/5 → 步骤3/4
        # page-8: 步骤5/5 → 步骤4/4
        # page-9: 步骤5/5 → 步骤4/4
        line = line.replace('步骤1/5', '步骤1/4')
        line = line.replace('步骤2/5', '步骤2/4')
        line = line.replace('步骤4/5', '步骤3/4')
        line = line.replace('步骤5/5', '步骤4/4')
        
        # Remove prompt-tag for 表情 in page-9
        # <div class="prompt-tag"><span class="prompt-tag-label">表情</span><span>呆萌</span></div>
        if 'prompt-tag-label' in line and '>表情<' in line:
            # Skip this line and check if the surrounding prompt-tag div needs removal
            continue
        # Also check for multi-line prompt-tag blocks
        # The prompt-tag might span multiple lines, but from the grep it appears to be on one line
        
        # Remove onclick="showPage(6)" references (shouldn't be any left after recipe-tag removal)
        # But just in case, replace showPage(6) with showPage(7) in any remaining places
        # Actually, since page-6 is gone, showPage(6) should be removed entirely
        
        new_lines.append(line)
    
    content = '\n'.join(new_lines)
    
    # Post-processing: Remove "姿态表情" progress-step blocks
    # Pattern: a <div class="progress-step"> block containing "姿态表情"
    pattern = re.compile(
        r'\s*<div class="progress-step">\s*'
        r'<div class="progress-circle[^"]*">[^<]*</div>\s*'
        r'<div class="progress-label[^"]*">姿态表情</div>\s*'
        r'</div>',
        re.DOTALL
    )
    content = pattern.sub('', content)
    
    # Also handle the progress-step with "active" class variant
    pattern2 = re.compile(
        r'\s*<div class="progress-step">\s*'
        r'<div class="progress-circle active">[^<]*</div>\s*'
        r'<div class="progress-label active">姿态表情</div>\s*'
        r'</div>',
        re.DOTALL
    )
    content = pattern2.sub('', content)
    
    # Also handle completed variant
    pattern3 = re.compile(
        r'\s*<div class="progress-step">\s*'
        r'<div class="progress-circle completed">✓</div>\s*'
        r'<div class="progress-label">姿态表情</div>\s*'
        r'</div>',
        re.DOTALL
    )
    content = pattern3.sub('', content)
    
    # Update progress bar numbering: after removing "姿态表情" step,
    # the remaining steps need renumbering
    # Old 6-step: 选择模型/贴纹饰/姿态表情/传统色/附加元素/确认提示词
    # New 5-step: 择灵物/贴纹饰/传统色/附加元素/确认提示词
    
    # In page-4 (择灵物): progress labels are already fine, just need to remove 姿态表情 step
    # Renumber: the circles after removal should be 1,2,3,4,5 instead of 1,2,3,4,5,6
    
    # Let's renumber progress circles in神兽 progress bars
    # Page-4: active=1, pending=2,3,4,5,6 → active=1, pending=2,3,4,5
    # Page-5: completed=✓,✓, active=3, pending=4,5,6 → completed=✓,✓, active=3, pending=4,5
    # But after removing 姿态表情 step, we need:
    # Page-4: active=1, pending=2,3,4,5
    # Page-5: completed=✓,✓, active=3, pending=4,5
    # Page-7: completed=✓,✓,✓, active=4, pending=5 (was completed=✓,✓,✓, active=4, pending=5,6)
    # Page-8: completed=✓,✓,✓,✓, active=5, pending=6 → completed=✓,✓,✓,✓, active=5
    # Page-9: completed=✓,✓,✓,✓,✓, active=6 → completed=✓,✓,✓,✓, active=5
    
    # These renumbering need to happen within each page's progress bar
    # Let's do targeted replacements for each page section
    
    # For the progress bars, after removing 姿态表情 step, we need to renumber
    # the circle numbers. Let's do this with regex within each page context.
    
    # Actually, let me re-read the current HTML more carefully.
    # After removing the 姿态表情 progress-step div, the remaining divs in each 
    # progress bar should already have the right labels, but the circle numbers 
    # might be wrong.
    
    # Let me just renumber all progress circles in神兽 pages systematically.
    # The easiest approach: find each神兽 progress bar and renumber.
    
    # For now, let's write the file and do a second pass for renumbering
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"index.html: First pass complete")
    return content

# Second pass: Renumber progress circles in神兽 pages
def renumber_progress_circles():
    path = os.path.join(BASE, 'index.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    new_lines = []
    in_beast_progress = False
    step_counter = 0
    
    # Track which page-section we're in
    current_page = None
    
    for i, line in enumerate(lines):
        # Detect page section
        page_match = re.search(r'id="page-(\d+)"', line)
        if page_match:
            current_page = page_match.group(1)
        
        # Detect start of a神兽 (non-tram) progress bar
        if '<div class="progress-bar">' in line and 'tram-progress' not in line:
            # Check if we're in a神兽 page (4, 5, 7, 8, 9)
            if current_page in ['4', '5', '7', '8', '9']:
                in_beast_progress = True
                step_counter = 0
        
        if in_beast_progress:
            # Count progress-step divs and renumber circles
            if '<div class="progress-circle active">' in line:
                step_counter += 1
                line = re.sub(
                    r'<div class="progress-circle active">\d+</div>',
                    f'<div class="progress-circle active">{step_counter}</div>',
                    line
                )
            elif '<div class="progress-circle pending">' in line:
                step_counter += 1
                line = re.sub(
                    r'<div class="progress-circle pending">\d+</div>',
                    f'<div class="progress-circle pending">{step_counter}</div>',
                    line
                )
            # completed circles with ✓ don't need renumbering
            
            # Detect end of progress bar
            if '</div>' in line and 'progress-bar' not in line:
                # Check if this is the closing div of progress-bar
                # Simple heuristic: if we see the next structural element
                pass
            
            # Reset when we leave the progress bar area
            if 'page-content' in line or 'bottom-buttons' in line:
                in_beast_progress = False
        
        new_lines.append(line)
    
    content = '\n'.join(new_lines)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("index.html: Progress circle renumbering complete")


# ============================================================
# 2. js/config.js cleanup
# ============================================================
def cleanup_config_js():
    path = os.path.join(BASE, 'js/config.js')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove selectedExpression from state
    content = content.replace("            selectedExpression: 'cute',\n", "")
    
    # Remove the expressions array (line 222)
    content = re.sub(
        r"var expressions = \[.*?\];",
        "",
        content,
        flags=re.DOTALL
    )
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("config.js: Cleanup complete")


# ============================================================
# 3. js/core.js cleanup
# ============================================================
def cleanup_core_js():
    path = os.path.join(BASE, 'js/core.js')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove the showPage(6) redirect
    content = content.replace("            if (n === 6) n = 7;\n", "")
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("core.js: Cleanup complete")


# ============================================================
# 4. js/ai-generate.js cleanup
# ============================================================
def cleanup_ai_generate_js():
    path = os.path.join(BASE, 'js/ai-generate.js')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Line 367: var ex = state.selectedExpression || 'cute';
    content = content.replace("var ex = state.selectedExpression || 'cute';", "// 表情步骤已移除")
    
    # Line 376: var expressions = { cute: ..., fierce: ..., cool: ..., funny: ... };
    content = re.sub(
        r"var expressions = \{ cute: 'M42 52 Q50 58 58 52', fierce: 'M40 54 L50 50 L60 54', cool: 'M42 50 Q50 56 58 50', funny: 'M40 48 Q50 58 60 48' \};",
        "// expressions 已移除",
        content
    )
    
    # Line 407: Remove the expressions path rendering
    # '<path d="' + expressions[ex] + '" stroke="#333" stroke-width="2" fill="none"/>'
    content = re.sub(
        r"'\x3cpath d=\"' \+ expressions\[ex\] \+ '\" stroke=\"#333\" stroke-width=\"2\" fill=\"none\"/\x3e' \+",
        "",
        content
    )
    
    # Also handle the non-escaped version if it exists
    content = re.sub(
        r"'\x3cpath d=\"' \+ expressions\[ex\] \+ '\" stroke=\"#333\" stroke-width=\"2\" fill=\"none\"/\x3e'",
        "''",
        content
    )
    
    # Lines 503-505: Remove expression lookup in generatePromptSummary
    # // 表情
    # var ex = expressions.find(function(e) { return e.id === state.selectedExpression; });
    # if (!ex) { ex = expressions[0]; }
    content = re.sub(
        r"\s*// 表情\n\s*var ex = expressions\.find\(function\(e\) \{ return e\.id === state\.selectedExpression; \}\);\n\s*if \(!ex\) \{ ex = expressions\[0\]; \}",
        "",
        content
    )
    
    # Line 535: Remove '表情' + ex.name + '，' from summonText
    # Original: '表情' + ex.name + '，'
    # After removing ex variable, we need to remove this part entirely
    content = content.replace(
        "'表情' + ex.name + '，'",
        ""
    )
    
    # Line 541: Remove '表情' + ex.name + '（' + ex.desc + '），' from aiPrompt
    content = content.replace(
        "'表情' + ex.name + '（' + ex.desc + '），'",
        ""
    )
    
    # Line 550: Remove expression prompt-tag-dynamic HTML
    # '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">表情</span><span>' + ex.name + ' ' + ex.emoji + '</span></div>'
    content = re.sub(
        r"\s*'\x3cdiv class=\"prompt-tag-dynamic\"\x3e\x3cspan class=\"prompt-tag-label\"\x3e表情\x3c/span\x3e\x3cspan\x3e' \+ ex\.name \+ ' ' \+ ex\.emoji \+ '\x3c/span\x3e\x3c/div\x3e' \+",
        "",
        content
    )
    
    # Also handle the eyeStyles variable that uses ex (selectedExpression)
    # In generateBeastCandidatesSVG, ex is used for SVG rendering
    # Line 367 sets ex = state.selectedExpression || 'cute'
    # We replaced that with a comment, but ex is still used below
    # We should default ex to 'cute' for SVG rendering (just the mouth path)
    content = content.replace(
        "// 表情步骤已移除",
        "var ex = 'cute';  // 表情步骤已移除，SVG降级默认使用cute"
    )
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("ai-generate.js: Cleanup complete")


# ============================================================
# 5. js/interactions.js cleanup
# ============================================================
def cleanup_interactions_js():
    path = os.path.join(BASE, 'js/interactions.js')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Line 18-20: Remove defaultExpression initialization
    # var defaultExpression = document.querySelector('#page-6 .expression-card.selected');
    # if (defaultExpression && defaultExpression.dataset.id) {
    #     state.selectedExpression = defaultExpression.dataset.id;
    # }
    content = re.sub(
        r"\s*var defaultExpression = document\.querySelector\('#page-6 \.expression-card\.selected'\);\n\s*if \(defaultExpression && defaultExpression\.dataset\.id\) \{\n\s*state\.selectedExpression = defaultExpression\.dataset\.id;\n\s*\}",
        "",
        content
    )
    
    # Line 30: Remove expression from console.log
    # console.log('[INIT] Default state synced:', { creature: state.selectedCreature, patterns: state.selectedPatterns, expression: state.selectedExpression, colors: state.selectedColors, elements: state.selectedElements });
    content = content.replace(
        "expression: state.selectedExpression, ",
        ""
    )
    
    # Line 57: Remove handleSingle('.expression-card', 'selectedExpression');
    content = content.replace(
        "handleSingle('.expression-card', 'selectedExpression');",
        "// expression-card handler removed (page-6 removed)"
    )
    
    # Lines 486-488: Remove if (state.selectedExpression) block in populateCompletionPage (outer function)
    # if (state.selectedExpression) {
    #     var ex = findById(expressions, state.selectedExpression);
    #     if (ex) tags.push({text: ex.emoji + ' ' + ex.name, type: 'gold'});
    # }
    content = re.sub(
        r"\s*if \(state\.selectedExpression\) \{\n\s*var ex = findById\(expressions, state\.selectedExpression\);\n\s*if \(ex\) tags\.push\(\{text: ex\.emoji \+ ' ' \+ ex\.name, type: 'gold'\}\);\n\s*\}",
        "",
        content
    )
    
    # Lines 584-587: Remove expression text drawing in saveToAlbum/drawRestOfCard (outer function)
    # if (state.selectedExpression) {
    #     var ex = findById(expressions, state.selectedExpression);
    #     if (ex) { ctx.fillText('表情：' + ex.emoji + ' ' + ex.name, 375, y); y += 38; }
    # }
    content = re.sub(
        r"\s*if \(state\.selectedExpression\) \{\n\s*var ex = findById\(expressions, state\.selectedExpression\);\n\s*if \(ex\) \{ ctx\.fillText\('表情：' \+ ex\.emoji \+ ' ' \+ ex\.name, 375, y\); y \+= 38; \}\n\s*\}",
        "",
        content
    )
    
    # Lines 747-750: Remove expressionName variable in downloadPrintWorkOrder
    # var expressionName = '';
    # if (state.selectedExpression) {
    #     var ex = findById(expressions, state.selectedExpression);
    #     if (ex) expressionName = ex.name;
    # }
    content = re.sub(
        r"\s*var expressionName = '';\n\s*if \(state\.selectedExpression\) \{\n\s*var ex = findById\(expressions, state\.selectedExpression\);\n\s*if \(ex\) expressionName = ex\.name;\n\s*\}",
        "",
        content
    )
    
    # Line 772: Remove '表情姿态：' + (expressionName || '未选择') + '\n';
    content = content.replace(
        "content += '表情姿态：' + (expressionName || '未选择') + '\\n';",
        "// 表情姿态已移除"
    )
    
    # Line 862: Remove ex: state.selectedExpression || '' from shareToParents shareData
    content = content.replace(
        "ex: state.selectedExpression || '',\n",
        ""
    )
    
    # Lines 1222-1224: Remove selectedExpression if block in DOMContentLoaded populateCompletionPage
    # if (state.selectedExpression) {
    #     var ex = findById(expressions, state.selectedExpression);
    #     if (ex) tags.push({text: ex.emoji + ' ' + ex.name, type: 'normal'});
    # }
    content = re.sub(
        r"\s*if \(state\.selectedExpression\) \{\n\s*var ex = findById\(expressions, state\.selectedExpression\);\n\s*if \(ex\) tags\.push\(\{text: ex\.emoji \+ ' ' \+ ex\.name, type: 'normal'\}\);\n\s*\}",
        "",
        content
    )
    
    # Lines 1275: Remove expression text drawing in DOMContentLoaded saveToAlbum
    # if (state.selectedExpression) { var ex = findById(expressions, state.selectedExpression); if (ex) { ctx.fillText('表情：' + ex.emoji + ' ' + ex.name, 375, y); y += 38; } }
    content = re.sub(
        r"\s*if \(state\.selectedExpression\) \{ var ex = findById\(expressions, state\.selectedExpression\); if \(ex\) \{ ctx\.fillText\('表情：' \+ ex\.emoji \+ ' ' \+ ex\.name, 375, y\); y \+= 38; \} \}",
        "",
        content
    )
    
    # Line 1317: Remove ex: state.selectedExpression || '' from DOMContentLoaded shareToParents shareData
    # This might appear slightly differently in the minified DOMContentLoaded version
    content = content.replace(
        "ex: state.selectedExpression || '',\n",
        ""
    )
    
    # Also handle any remaining inline version on a single line
    content = re.sub(
        r"ex: state\.selectedExpression \|\| '',\s*\n?",
        "",
        content
    )
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("interactions.js: Cleanup complete")


# ============================================================
# Run all cleanups
# ============================================================
if __name__ == '__main__':
    print("Starting cleanup...")
    
    cleanup_index_html()
    renumber_progress_circles()
    cleanup_config_js()
    cleanup_core_js()
    cleanup_ai_generate_js()
    cleanup_interactions_js()
    
    print("\nAll cleanups complete!")
