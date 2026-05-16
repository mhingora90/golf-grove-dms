with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

OLD = '<!-- MODAL -->'
SCREEN = (
    '<div id="project-screen">\n'
    '  <div class="ps-header">\n'
    '    <div>\n'
    '      <div class="ps-title">Projects</div>\n'
    '      <div class="ps-sub">Select a project to continue</div>\n'
    '    </div>\n'
    '    <button id="proj-new-btn" class="btn btn-primary" onclick="openNewProject()" style="display:none">+ New Project</button>\n'
    '  </div>\n'
    '  <div class="ps-grid" id="proj-grid"></div>\n'
    '</div>\n\n'
    '<!-- MODAL -->'
)

assert OLD in html, "FAIL: anchor <!-- MODAL --> not found"
html = html.replace(OLD, SCREEN, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('OK')
