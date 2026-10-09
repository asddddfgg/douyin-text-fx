let activeBox = null;
let isDragging = false;
let isResizing = false;
let startX = 0, startY = 0;
let startW = 0, startH = 0;
let startLeft = 0, startTop = 0;

function setupDragResize(box) {
  const handle = box.querySelector('.resize-handle');

  box.onmousedown = (e) => {
    if (e.target === handle) return;
    isDragging = true;
    activeBox = box;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = box.offsetLeft;
    startTop = box.offsetTop;
    document.querySelectorAll('.text-box').forEach(b => b.classList.remove('selected'));
    box.classList.add('selected');
    e.stopPropagation();
  };

  if (handle) {
    handle.onmousedown = (e) => {
      isResizing = true;
      activeBox = box;
      startX = e.clientX;
      startY = e.clientY;
      startW = box.offsetWidth;
      startH = box.offsetHeight;
      document.querySelectorAll('.text-box').forEach(b => b.classList.remove('selected'));
      box.classList.add('selected');
      e.stopPropagation();
    };
  }
}

document.addEventListener('mousemove', (e) => {
  if (!activeBox) return;

  if (isDragging) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = startLeft + dx;
    const newTop = startTop + dy;

    state.textBox.x = newLeft;
    state.textBox.y = newTop;

    // 拖动位置时只做平滑样式同步，不重建页面
    syncAllTextBoxes();
  } else if (isResizing) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const newW = Math.max(60, startW + dx);
    const newH = Math.max(30, startH + dy);

    state.textBox.w = newW;
    state.textBox.h = newH;
    
    // 改变大小时同步样式与计算重新分页（DOM保留，防闪烁）
    renderAllCards();
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging || isResizing) {
    isDragging = false;
    isResizing = false;
    activeBox = null;
    renderAllCards();
  }
});

function syncAllTextBoxes() {
  document.querySelectorAll('.text-box').forEach(box => {
    if (state.textBox.x !== null) box.style.left = state.textBox.x + 'px';
    if (state.textBox.y !== null) box.style.top = state.textBox.y + 'px';
    if (state.textBox.w !== null) box.style.width = state.textBox.w + 'px';
    if (state.textBox.h !== null) box.style.height = state.textBox.h + 'px';
  });
}