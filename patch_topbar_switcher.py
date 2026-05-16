with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

OLD = '      <div class="topbar-right">'
assert html.count(OLD) == 1, f'Expected 1 match, got {html.count(OLD)}'

NEW = (
    '      <div class="psw-wrap" id="psw-wrap" style="display:none">\n'
    '        <div class="psw-pill" onclick="toggleProjectDropdown()">\n'
    '          <div class="psw-dot"></div>\n'
    '          <span id="psw-name"></span>\n'
    '          <span class="psw-caret">&#9660;</span>\n'
    '        </div>\n'
    '        <div class="psw-dd" id="psw-dd"></div>\n'
    '      </div>\n'
    '      <div class="tb-proj-div" id="tb-proj-div" style="display:none"></div>\n'
    '      <div class="topbar-right">'
)

html = html.replace(OLD, NEW, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('OK')
