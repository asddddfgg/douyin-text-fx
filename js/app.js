const $ = id => document.getElementById(id);
const textInput = $('textInput');
const previewGrid = $('previewGrid');
const effectChips = $('effectChips');
const effectsDrawer = $('effectsDrawer');

async function init() {
  try {
    await openDB();
    await restoreFont();
    await restoreSavedBgs();
  } catch (err) {
    console.error('IndexedDB 初始化失败', err);
    alert('本地数据库初始化失败，大文件持久化功能可能不可用');
  }

  textInput.value = state.text;
  buildEffectChips();
  renderAllCards();
  bindEvents();
  loadPresetsUI();
  updateEffectCount();
  updateStorageInfo();
}

async function restoreFont() {
  const record = await idbGet('fonts', 'current');
  if (!record || !record.data) return;
  try {
    const font = new FontFace(record.name, record.data);
    await font.load();
    document.fonts.add(font);
    state.customFont = record.name;
    state.customFontName = record.originalName || record.name;
    $('fontInfo').textContent = `已加载: ${state.customFontName}`;
    refreshAllTextStyles();
  } catch (e) {
    console.warn('字体恢复失败', e);
    await idbDelete('fonts', 'current');
  }
}

async function restoreSavedBgs() {
  const list = await idbGetAll('bgs');
  state.savedBgs = list || [];
  renderSavedBgs();
}

async function handleFontFile(file) {
  try {
    const buffer = await file.arrayBuffer();
    const fontName = 'CustomFont_' + Date.now();
    const font = new FontFace(fontName, buffer);
    await font.load();
    document.fonts.add(font);

    await idbPut('fonts', {
      id: 'current',
      name: fontName,
      originalName: file.name,
      data: buffer,
      size: file.size
    });

    state.customFont = fontName;
    state.customFontName = file.name;
    $('fontInfo').textContent = `已加载: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB)`;
    refreshAllTextStyles();
    updateStorageInfo();
    alert('字体已保存到本地数据库，下次打开自动加载（支持大文件）');
  } catch (err) {
    alert('字体加载失败: ' + err.message);
  }
}

async function saveCurrentBackground() {
  try {
    if (state.bgImage) {
      let blob;
      if (state.bgImage.startsWith('blob:') || state.bgImage.startsWith('data:')) {
        const res = await fetch(state.bgImage);
        blob = await res.blob();
      } else {
        return alert('当前背景图无法收藏');
      }
      const id = await idbPut('bgs', {
        type: 'image',
        name: '背景图 ' + new Date().toLocaleString(),
        blob: blob,
        size: blob.size
      });
      state.savedBgs.push({ id, type: 'image', name: '背景图', blob, size: blob.size });
    } else {
      const exists = state.savedBgs.some(b => b.type === 'color' && b.value === state.bgColor);
      if (exists) return alert('这个颜色已经收藏过了');
      const id = await idbPut('bgs', {
        type: 'color',
        value: state.bgColor
      });
      state.savedBgs.push({ id, type: 'color', value: state.bgColor });
    }
    renderSavedBgs();
    updateStorageInfo();
    alert('背景已收藏！刷新后仍然保留');
  } catch (err) {
    alert('收藏失败: ' + err.message);
  }
}

function renderSavedBgs() {
  const section = $('savedBgSection');
  const list = $('savedBgList');
  list.innerHTML = '';

  if (state.savedBgs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  state.savedBgs.forEach((item) => {
    const s = document.createElement('div');
    s.className = 'swatch';

    if (item.type === 'color') {
      s.style.background = item.value;
      s.title = item.value;
    } else {
      const url = URL.createObjectURL(item.blob);
      s.style.backgroundImage = `url(${url})`;
      s.style.backgroundSize = 'cover';
      s.title = item.name || '背景图';
    }

    s.onclick = () => {
      document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      if (item.type === 'color') {
        state.bgColor = item.value;
        state.bgImage = null;
      } else {
        state.bgImage = URL.createObjectURL(item.blob);
      }
      document.querySelectorAll('.canvas-bg').forEach(applyBackground);
    };

    const del = document.createElement('div');
    del.className = 'del';
    del.textContent = '×';
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('确定删除这个收藏背景？')) return;
      try {
        await idbDelete('bgs', item.id);
        state.savedBgs = state.savedBgs.filter(b => b.id !== item.id);
        renderSavedBgs();
        updateStorageInfo();
      } catch (err) {
        alert('删除失败: ' + err.message);
      }
    };
    s.appendChild(del);
    list.appendChild(s);
  });
}

function buildEffectChips() {
  effectChips.innerHTML = '';
  EFFECTS.forEach(fx => {
    const chip = document.createElement('div');
    chip.className = 'chip on';
    chip.dataset.id = fx.id;
    chip.textContent = fx.name;
    chip.onclick = () => {
      if (state.enabledEffects.has(fx.id)) {
        state.enabledEffects.delete(fx.id);
        chip.classList.remove('on');
      } else {
        state.enabledEffects.add(fx.id);
        chip.classList.add('on');
      }
      renderAllCards();
      updateEffectCount();
    };
    effectChips.appendChild(chip);
  });
}

function updateEffectCount() {
  $('effectCount').textContent = `${state.enabledEffects.size} / ${EFFECTS.length}`;
}

function renderAllCards() {
  previewGrid.innerHTML = '';
  EFFECTS.filter(fx => state.enabledEffects.has(fx.id)).forEach(fx => {
    const card = createCard(fx);
    previewGrid.appendChild(card);
  });
  syncAllTextBoxes();
}

function createCard(fx) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = fx.id;

  card.innerHTML = `
    <div class="card-header">
      <span class="name">${fx.name}</span>
      <div class="card-actions">
        <button title="删除此效果" class="btn-remove">✕</button>
      </div>
    </div>
    <div class="canvas-wrap view-${state.viewMode}" id="canvas-${fx.id}">
      <div class="canvas-bg"></div>
      <div class="canvas-content">
        <div class="text-box" data-fx="${fx.id}">
          <span class="fx-text ${fx.cls}"></span>
          <div class="resize-handle"></div>
        </div>
      </div>
      <div class="safe-overlay">
        <div class="safe-top"></div>
        <div class="safe-right"></div>
        <div class="safe-bottom"></div>
      </div>
      <div class="phone-frame">
        <div class="phone-notch"></div>
        <div class="phone-home"></div>
      </div>
    </div>
    <div class="card-footer">
      <button class="btn export btn-export-single">导出 PNG</button>
    </div>
  `;

  card.querySelector('.btn-remove').onclick = () => removeEffect(fx.id);
  card.querySelector('.btn-export-single').onclick = () => exportSingle(fx.id);

  const bgEl = card.querySelector('.canvas-bg');
  applyBackground(bgEl);

  const textEl = card.querySelector('.fx-text');
  updateTextStyle(textEl, fx);

  const textBox = card.querySelector('.text-box');
  setupDragResize(textBox);

  return card;
}

function applyBackground(bgEl) {
  bgEl.style.backgroundColor = state.bgColor;
  if (state.bgImage) {
    bgEl.style.backgroundImage = `url(${state.bgImage})`;
    bgEl.style.filter = `brightness(${state.bgBrightness})`;
    bgEl.style.opacity = state.bgOpacity;
  } else {
    bgEl.style.backgroundImage = 'none';
    bgEl.style.filter = 'none';
    bgEl.style.opacity = 1;
  }
}

function updateTextStyle(textEl, fx) {
  textEl.textContent = state.text;
  textEl.style.fontSize = state.fontSize + 'px';
  textEl.style.lineHeight = state.lineHeight;
  const ls = state.letterSpacing + (fx.extraLetter || 0);
  textEl.style.letterSpacing = ls + 'px';
  textEl.style.textAlign = state.align;
  textEl.style.fontWeight = state.bold ? '700' : '400';
  textEl.style.fontFamily = state.customFont || '';
  if (state.textColor) {
    textEl.style.color = state.textColor;
    textEl.style.webkitTextFillColor = state.textColor;
    textEl.style.background = 'none';
  }
}

function bindEvents() {
  textInput.addEventListener('input', () => {
    state.text = textInput.value;
    document.querySelectorAll('.fx-text').forEach(el => {
      el.textContent = state.text;
    });
  });

  $('fontSize').oninput = e => {
    state.fontSize = +e.target.value;
    $('fontSizeVal').textContent = state.fontSize;
    refreshAllTextStyles();
  };
  $('lineHeight').oninput = e => {
    state.lineHeight = +e.target.value;
    $('lineHeightVal').textContent = state.lineHeight.toFixed(1);
    refreshAllTextStyles();
  };
  $('letterSpacing').oninput = e => {
    state.letterSpacing = +e.target.value;
    $('letterSpacingVal').textContent = state.letterSpacing;
    refreshAllTextStyles();
  };
  $('boldBtn').onclick = () => {
    state.bold = !state.bold;
    $('boldBtn').classList.toggle('active', state.bold);
    refreshAllTextStyles();
  };
  document.querySelectorAll('[data-align]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.align = btn.dataset.align;
      refreshAllTextStyles();
    };
  });

  $('textColor').oninput = e => {     state.textColor = e.target.value;     refreshAllTextStyles();   };$('resetColorBtn').onclick = () => {
    state.textColor = null;
    $('textColor').value = '#ffffff';
    renderAllCards();
  };

  document.querySelectorAll('#bgSwatches .swatch').forEach(s => {
    s.onclick = () => {
      document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      state.bgColor = s.dataset.bg;
      state.bgImage = null;
      document.querySelectorAll('.canvas-bg').forEach(applyBackground);
    };
  });
  $('customBg').oninput = e => {
    state.bgColor = e.target.value;
    state.bgImage = null;
    document.querySelectorAll('.canvas-bg').forEach(applyBackground);
  };

  $('saveBgBtn').onclick = saveCurrentBackground;

  $('bgImageInput').onchange = e => {     const file = e.target.files[0];     if (!file) return;     const url = URL.createObjectURL(file);     state.bgImage = url;     document.querySelectorAll('.canvas-bg').forEach(applyBackground);   };$('bgBrightness').oninput = e => {
    state.bgBrightness = +e.target.value;
    document.querySelectorAll('.canvas-bg').forEach(applyBackground);
  };
  $('bgOpacity').oninput = e => {     state.bgOpacity = +e.target.value;     document.querySelectorAll('.canvas-bg').forEach(applyBackground);   };$('clearBgBtn').onclick = () => {
    state.bgImage = null;
    $('bgImageInput').value = '';
    document.querySelectorAll('.canvas-bg').forEach(applyBackground);
  };

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewMode = btn.dataset.view;
      document.querySelectorAll('.canvas-wrap').forEach(c => {
        c.className = 'canvas-wrap view-' + state.viewMode;
      });
    };
  });

  $('fontInput').onchange = e => {     const file = e.target.files[0];     if (file) handleFontFile(file);   };$('resetFontBtn').onclick = async () => {
    state.customFont = null;
    state.customFontName = null;
    $('fontInput').value = '';$('fontInfo').textContent = '未加载自定义字体';
    try {
      await idbDelete('fonts', 'current');
    } catch (e) {}
    refreshAllTextStyles();
    updateStorageInfo();
  };

  $('toggleEffectsBtn').onclick = () => {
    effectsDrawer.classList.toggle('open');
  };

  $('exportAllBtn').onclick = exportAll;
  $('savePresetBtn').onclick = savePreset;
}

function refreshAllTextStyles() {
  document.querySelectorAll('.text-box').forEach(box => {
    const fxId = +box.dataset.fx;
    const fx = EFFECTS.find(f => f.id === fxId);
    const textEl = box.querySelector('.fx-text');
    updateTextStyle(textEl, fx);
  });
}

async function updateStorageInfo() {
  if (navigator.storage && navigator.storageestimate) {
    try {
      const est = await navigator.storage.estimate();
      const used = (est.usage / 1024 / 1024).toFixed(1);
      const quota = (est.quota / 1024 / 1024).toFixed(0);
      $('storageInfo').textContent = `存储: ${used}MB / ${quota}MB`;
    } catch (e) {}
  }
}

function removeEffect(id) {
  state.enabledEffects.delete(id);
  const chip = effectChips.querySelector(`[data-id="${id}"]`);
  if (chip) chip.classList.remove('on');
  renderAllCards();
  updateEffectCount();
}

async function exportSingle(id) {
  const canvasWrap = document.getElementById('canvas-' + id);
  if (!canvasWrap) return;

  const prevClass = canvasWrap.className;
  canvasWrap.className = 'canvas-wrap view-pure';

  try {
    const canvas = await html2canvas(canvasWrap, {
      scale: 3,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = `抖音质感特效-样式${id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('导出失败: ' + err.message);
  } finally {
    canvasWrap.className = prevClass;
  }
}

async function exportAll() {
  const ids = [...state.enabledEffects];
  for (let i = 0; i < ids.length; i++) {
    await exportSingle(ids[i]);
    await new Promise(r => setTimeout(r, 300));
  }
  alert(`已导出 ${ids.length} 张高清 PNG`);
}

function savePreset() {
  const name = $('presetName').value.trim() || `预设${state.presets.length + 1}`;
  const preset = {
    name,
    text: state.text,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    letterSpacing: state.letterSpacing,
    align: state.align,
    bold: state.bold,
    textColor: state.textColor,
    bgColor: state.bgColor,
    textBox: { ...state.textBox },
    enabled: [...state.enabledEffects],
  };
  state.presets.push(preset);
  localStorage.setItem('douyin_presets', JSON.stringify(state.presets));
  loadPresetsUI();
  $('presetName').value = '';
}

function loadPresetsUI() {
  const list = $('presetList');
  list.innerHTML = '';
  state.presets.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.textContent = p.name;
    item.onclick = () => applyPreset(p);
    item.oncontextmenu = e => {
      e.preventDefault();
      if (confirm('删除此预设？')) {
        state.presets.splice(idx, 1);
        localStorage.setItem('douyin_presets', JSON.stringify(state.presets));
        loadPresetsUI();
      }
    };
    list.appendChild(item);
  });
}

function applyPreset(p) {
  state.text = p.text;
  state.fontSize = p.fontSize;
  state.lineHeight = p.lineHeight;
  state.letterSpacing = p.letterSpacing;
  state.align = p.align;
  state.bold = p.bold;
  state.textColor = p.textColor;
  state.bgColor = p.bgColor;
  state.textBox = { ...p.textBox };
  state.enabledEffects = new Set(p.enabled || EFFECTS.map(e => e.id));

  textInput.value = state.text;
  $('fontSize').value = state.fontSize;
  $('fontSizeVal').textContent = state.fontSize;
  $('lineHeight').value = state.lineHeight;
  $('lineHeightVal').textContent = state.lineHeight;
  $('letterSpacing').value = state.letterSpacing;
  $('letterSpacingVal').textContent = state.letterSpacing;
  $('boldBtn').classList.toggle('active', state.bold);
  document.querySelectorAll('[data-align]').forEach(b => {
    b.classList.toggle('active', b.dataset.align === state.align);
  });

  effectChips.querySelectorAll('.chip').forEach(chip => {
    const id = +chip.dataset.id;
    chip.classList.toggle('on', state.enabledEffects.has(id));
  });

  renderAllCards();
  updateEffectCount();
}

// 页面加载完成后自动启动
document.addEventListener('DOMContentLoaded', init);