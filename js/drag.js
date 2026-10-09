function syncAllTextBoxes() {
  document.querySelectorAll('.text-box').forEach(box => {
    box.style.left = state.textBox.x + 'px';
    box.style.top = state.textBox.y + 'px';
    box.style.width = state.textBox.w + 'px';
    box.style.height = state.textBox.h + 'px';
  });
}

function setupDragResize(box) {
  const handle = box.querySelector('.resize-handle');

  box.addEventListener('mousedown', e => {
    if (e.target === handle) return;
    e.preventDefault();
    box.classList.add('selected');
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = state.textBox.x;
    const origY = state.textBox.y;

    function onMove(ev) {
      let nx = origX + (ev.clientX - startX);
      let ny = origY + (ev.clientY - startY);
      nx = Math.max(0, Math.min(270 - state.textBox.w, nx));
      ny = Math.max(0, Math.min(480 - state.textBox.h, ny));
      state.textBox.x = nx;
      state.textBox.y = ny;
      syncAllTextBoxes();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      box.classList.remove('selected');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    box.classList.add('selected');
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = state.textBox.w;
    const origH = state.textBox.h;

    function onMove(ev) {
      let nw = origW + (ev.clientX - startX);
      let nh = origH + (ev.clientY - startY);
      nw = Math.max(40, Math.min(270 - state.textBox.x, nw));
      nh = Math.max(24, Math.min(480 - state.textBox.y, nh));
      state.textBox.w = nw;
      state.textBox.h = nh;
      syncAllTextBoxes();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      box.classList.remove('selected');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}