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
    await restoreStickers();
  } catch (err) {
    console.error('IndexedDB 初始化失败', err);
  }

  if (state.text) {
    textInput.innerHTML = state.text;
  } else {
    state.text = textInput.innerHTML;
  }

  buildEffectChips();
  renderAllCards();
  bindEvents();
  loadPresetsUI();
  updateEffectCount();
  updateStorageInfo();
}

// 富文本编辑操作指令
function execCmd(command, value = null) {
  document.execCommand(command, false, value);
  textInput.focus();
  state.text = textInput.innerHTML;
  renderAllCards();
}

/**
 * 智能高亮 Toggle 控制逻辑
 */
function applyHighlight(color) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  
  let parentMark = selection.anchorNode;
  while (parentMark && parentMark !== textInput) {
    if (parentMark.nodeName === 'MARK' || (parentMark.style && parentMark.style.backgroundColor)) {
      break;
    }
    parentMark = parentMark.parentNode;
  }

  if (parentMark && parentMark !== textInput) {
    const currentColor = parentMark.style.backgroundColor;
    
    const tempDiv = document.createElement('div');
    tempDiv.style.color = color;
    document.body.appendChild(tempDiv);
    const targetRgb = window.getComputedStyle(tempDiv).color;
    document.body.removeChild(tempDiv);

    if (currentColor === targetRgb || currentColor === color) {
      // 再次点击同色 -> 取消高亮
      const parent = parentMark.parentNode;
      while (parentMark.firstChild) {
        parent.insertBefore(parentMark.firstChild, parentMark);
      }
      parent.removeChild(parentMark);
    } else {
      // 换颜色
      parentMark.style.backgroundColor = color;
    }
  } else {
    // 增加高亮
    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.color = 'inherit';
    mark.style.padding = '0 2px';
    mark.style.borderRadius = '2px';

    try {
      range.surroundContents(mark);
    } catch (e) {
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
    }
  }

  textInput.focus();
  state.text = textInput.innerHTML;
  renderAllCards();
}

function applyColor(color) {
  execCmd('foreColor', color);
}

/**
 * 彻底清除格式（包括：内联样式、底色 mark 标签、以及 H1/H2 块级标题标签）
 */
function clearFormat() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  // 1. 还原块级标题节点为普通段落 <p>
  document.execCommand('formatBlock', false, '<p>');

  // 2. 执行原生内联格式清除 (清空 B, I, U, 颜色等)
  document.execCommand('removeFormat', false, null);

  // 3. 彻底清理 <mark> 标签
  const marks = textInput.querySelectorAll('mark');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });

  // 4. 清理所有残留的行内背景色 style
  const styledEls = textInput.querySelectorAll('[style*="background"]');
  styledEls.forEach(el => {
    el.style.backgroundColor = '';
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });

  textInput.focus();
  state.text = textInput.innerHTML;
  renderAllCards();
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
  if (!section || !list) return;
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
  if (!effectChips) return;
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
  const el = $('effectCount');
  if (el) el.textContent = `${state.enabledEffects.size} / ${EFFECTS.length}`;
}

/**
 * 物理框高自动分页算法
 */
function getPagesText() {
  if (!state.text) return [''];

  const boxW = (state.textBox && state.textBox.w) ? state.textBox.w : 210;
  const boxH = (state.textBox && state.textBox.h) ? state.textBox.h : 200;

  const offscreen = document.createElement('div');
  offscreen.style.cssText = `
    position: absolute;
    visibility: hidden;
    left: -9999px;
    top: -9999px;
    width: ${boxW}px;
    font-size: ${state.fontSize}px;
    line-height: ${state.lineHeight};
    letter-spacing: ${state.letterSpacing}px;
    font-weight: ${state.bold ? '700' : '400'};
    font-family: ${state.customFont || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'};
    word-break: break-word;
    white-space: pre-wrap;
    padding: 4px;
    box-sizing: border-box;
  `;
  document.body.appendChild(offscreen);

  let remainingHTML = state.text;
  const pages = [];

  while (remainingHTML.trim().length > 0) {
    offscreen.innerHTML = remainingHTML;

    if (offscreen.offsetHeight <= boxH) {
      pages.push(remainingHTML);
      break;
    }

    let pageHTML = '';
    const range = document.createRange();
    const startTop = offscreen.getBoundingClientRect().top;

    const walker = document.createTreeWalker(offscreen, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    let foundBoundary = false;

    while ((textNode = walker.nextNode())) {
      for (let i = 0; i < textNode.textContent.length; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const rect = range.getBoundingClientRect();
        
        if (rect.bottom - startTop > boxH) {
          foundBoundary = true;
          break;
        }
      }
      if (foundBoundary) break;
    }

    if (foundBoundary && range.startContainer) {
      const splitRange = document.createRange();
      splitRange.setStart(offscreen, 0);
      splitRange.setEnd(range.startContainer, range.startOffset);

      const div = document.createElement('div');
      div.appendChild(splitRange.cloneContents());
      pageHTML = div.innerHTML;

      const restRange = document.createRange();
      restRange.setStart(range.startContainer, range.startOffset);
      restRange.setEnd(offscreen, offscreen.childNodes.length);

      const restDiv = document.createElement('div');
      restDiv.appendChild(restRange.cloneContents());
      remainingHTML = restDiv.innerHTML;
    } else {
      pages.push(remainingHTML);
      break;
    }

    if (!pageHTML || pageHTML === remainingHTML) {
      pages.push(remainingHTML);
      break;
    }

    pages.push(pageHTML);
  }

  document.body.removeChild(offscreen);
  return pages.length > 0 ? pages : [''];
}

function renderAllCards() {
  if (!previewGrid) return;
  const pagesText = getPagesText();
  const enabledFx = EFFECTS.filter(fx => state.enabledEffects.has(fx.id));

  const currentTotalCards = enabledFx.length * pagesText.length;
  const existingCards = previewGrid.querySelectorAll('.card');

  if (existingCards.length !== currentTotalCards) {
    previewGrid.innerHTML = '';
    enabledFx.forEach(fx => {
      pagesText.forEach((pageContent, pageIdx) => {
        const card = createCard(fx, pageContent, pageIdx + 1, pagesText.length);
        previewGrid.appendChild(card);
      });
    });
  } else {
    let cardIdx = 0;
    enabledFx.forEach(fx => {
      pagesText.forEach((pageContent) => {
        const card = existingCards[cardIdx++];
        if (card) {
          const textEl = card.querySelector('.fx-text');
          if (textEl) textEl.innerHTML = pageContent;
        }
      });
    });
  }

  syncAllTextBoxes();
}

function createCard(fx, pageContent, pageNum, totalPages) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = fx.id;
  card.dataset.page = pageNum;

  const pageBadge = totalPages > 1 ? ` (第 ${pageNum}/${totalPages} 页)` : '';

  card.innerHTML = `
    <div class="card-header">
      <span class="name">${fx.name}${pageBadge}</span>
      <div class="card-actions">
        <button title="删除此效果" class="btn-remove">✕</button>
      </div>
    </div>
    <div class="canvas-wrap view-${state.viewMode}" id="canvas-${fx.id}-p${pageNum}">
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
  card.querySelector('.btn-export-single').onclick = () => exportSinglePage(fx.id, pageNum);

  const bgEl = card.querySelector('.canvas-bg');
  applyBackground(bgEl);

  const textEl = card.querySelector('.fx-text');
  updateTextStyle(textEl, fx, pageContent);

  const textBox = card.querySelector('.text-box');
  setupDragResize(textBox);
  renderStickersForCanvas(card.querySelector(".canvas-wrap"), pageNum);

  return card;
}

function applyBackground(bgEl) {
  if (!bgEl) return;
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

function updateTextStyle(textEl, fx, content) {
  if (!textEl) return;
  textEl.innerHTML = content !== undefined ? content : state.text;
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
  }
}

function bindEvents() {
  let textRenderTimer = null;

  const flushTextRender = () => {
    if (textRenderTimer !== null) {
      clearTimeout(textRenderTimer);
      textRenderTimer = null;
      renderAllCards();
    }
  };

  textInput.addEventListener('input', () => {
    state.text = textInput.innerHTML;

    if (textRenderTimer !== null) {
      clearTimeout(textRenderTimer);
    }

    textRenderTimer = setTimeout(() => {
      textRenderTimer = null;
      renderAllCards();
    }, 140);
  });

  textInput.addEventListener('blur', flushTextRender);

  $('fontSize').oninput = e => {
    state.fontSize = +e.target.value;
    $('fontSizeVal').textContent = state.fontSize;
    renderAllCards();
  };
  $('lineHeight').oninput = e => {
    state.lineHeight = +e.target.value;
    $('lineHeightVal').textContent = state.lineHeight.toFixed(1);
    refreshAllTextStyles();
  };
  $('letterSpacing').oninput = e => {
    state.letterSpacing = +e.target.value;
    $('letterSpacingVal').textContent = state.letterSpacing;
    renderAllCards();
  };
  $('exportScale').oninput = e => {
    state.exportScale = +e.target.value;
    $('exportScaleVal').textContent = state.exportScale;
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

  if ($('toggleEffectsBtn')) {$('toggleEffectsBtn').onclick = () => {
      effectsDrawer.classList.toggle('open');
    };
  }

  if ($('exportAllBtn'))$('exportAllBtn').onclick = exportAll;
  if ($('savePresetBtn'))$('savePresetBtn').onclick = savePreset;
}

function refreshAllTextStyles() {
  const pagesText = getPagesText();
  document.querySelectorAll('.card').forEach(card => {
    const pageNum = +card.dataset.page || 1;
    const pageContent = pagesText[pageNum - 1] || '';
    const fxId = +card.dataset.id;
    const fx = EFFECTS.find(f => f.id === fxId);
    const textEl = card.querySelector('.fx-text');
    if (textEl) updateTextStyle(textEl, fx, pageContent);
  });
}

async function updateStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const used = (est.usage / 1024 / 1024).toFixed(1);
      const quota = (est.quota / 1024 / 1024).toFixed(0);
      const infoEl = $('storageInfo');
      if (infoEl) infoEl.textContent = `存储: ${used}MB / ${quota}MB`;
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

async function exportSinglePage(id, pageNum) {
  const canvasWrap = document.getElementById(`canvas-${id}-p${pageNum}`);
  if (!canvasWrap) return;

  const prevClass = canvasWrap.className;
  canvasWrap.className = 'canvas-wrap view-pure';

  try {
    const canvas = await html2canvas(canvasWrap, {
      scale: state.exportScale,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      onclone: (clonedDocument) => {
        clonedDocument.querySelectorAll('.sticker-item').forEach((el) => {
          el.classList.remove('is-selected');
        });
        clonedDocument.querySelectorAll('.sticker-handle, .sticker-name').forEach((el) => {
          el.style.display = 'none';
        });

        // 导出时隐藏文字图层的编辑控制元素，保留文字本身。
        clonedDocument.querySelectorAll('.text-layer-item').forEach((el) => {
          el.classList.remove('selected');
          el.style.outline = 'none';
        });
        clonedDocument.querySelectorAll('.text-layer-handle').forEach((el) => {
          el.style.display = 'none';
        });
        clonedDocument.querySelectorAll('.text-layer-content[contenteditable="true"]').forEach((el) => {
          el.style.outline = 'none';
        });
      },
    });
    const link = document.createElement('a');
    link.download = `抖音特效-样式${id}-P${pageNum}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('导出失败: ' + err.message);
  } finally {
    canvasWrap.className = prevClass;
  }
}

async function exportAll() {
  const cards = document.querySelectorAll('.card');
  const delayMs = state.exportScale > 4 ? 400 : 200;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const id = +card.dataset.id;
    const pageNum = +card.dataset.page || 1;
    await exportSinglePage(id, pageNum);
    await new Promise(r => setTimeout(r, delayMs));
  }
  alert(`已按 ${state.exportScale}× 清晰度导出全部共 ${cards.length} 张图片`);
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
  if (!list) return;
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

  textInput.innerHTML = state.text;
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

  if (effectChips) {
    effectChips.querySelectorAll('.chip').forEach(chip => {
      const id = +chip.dataset.id;
      chip.classList.toggle('on', state.enabledEffects.has(id));
    });
  }

  renderAllCards();
  updateEffectCount();
}

document.addEventListener('DOMContentLoaded', init);


/**
 * 智能标题 Toggle 控制逻辑
 * 1. 已是当前标题 (如 H1) 时再次点击 -> 还原为普通段落 <p>
 * 2. 不是当前标题时点击 -> 切换为指定标题 (<h1/h2>)
 */
function applyHeading(tag) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  // 获取当前光标所在的块级父节点
  let parentBlock = selection.anchorNode;
  while (parentBlock && parentBlock !== textInput) {
    if (/^H[1-6]$/i.test(parentBlock.nodeName) || parentBlock.nodeName === 'P' || parentBlock.nodeName === 'DIV') {
      break;
    }
    parentBlock = parentBlock.parentNode;
  }

  // 判断是否已经是目标标题标签
  if (parentBlock && parentBlock.nodeName.toLowerCase() === tag.toLowerCase()) {
    // 再次点击同名标题 -> 恢复为普通段落文本 <p>
    document.execCommand('formatBlock', false, '<p>');
  } else {
    // 切换为指定标题 (如 <h1> 或 <h2>)
    document.execCommand('formatBlock', false, `<${tag}>`);
  }

  textInput.focus();
  state.text = textInput.innerHTML;
  renderAllCards();
}

/**
 * 彻底清除格式（包括：内联样式、底色 mark 标签、以及 H1/H2 块级标题标签）
 */


/**
 * 切换图标选择面板的显隐状态
 */
function toggleIconPicker(e) {
  e.stopPropagation();
  const panel = $('iconPickerPanel');
  if (panel) {
    panel.classList.toggle('open');
  }
}

/**
 * 选中某个 Icon/Emoji 并插入到当前富文本光标处
 */
function selectIcon(iconStr) {
  textInput.focus();
  document.execCommand('insertHTML', false, `<span class="inline-icon">${iconStr}</span>&nbsp;`);
  state.text = textInput.innerHTML;
  renderAllCards();
  
  // 选完后自动关闭弹窗
  const panel = $('iconPickerPanel');
  if (panel) panel.classList.remove('open');
}

// 点击页面其他空白区域时，自动关闭图标选择弹窗
document.addEventListener('click', () => {
  const panel = $('iconPickerPanel');
  if (panel) panel.classList.remove('open');
});

/**
 * 切换图标选择面板显隐
 */
function toggleIconPicker(e) {
  e.stopPropagation();
  const panel = $('iconPickerPanel');
  if (panel) {
    panel.classList.toggle('open');
  }
}

/**
 * 插入 Emoji 表情字符
 */
function selectIcon(iconStr) {
  textInput.focus();
  document.execCommand('insertHTML', false, `<span class="inline-icon">${iconStr}</span>&nbsp;`);
  state.text = textInput.innerHTML;
  renderAllCards();
  
  const panel = $('iconPickerPanel');
  if (panel) panel.classList.remove('open');
}

// 点击空白区域自动收起弹窗
document.addEventListener('click', () => {
  const panel = $('iconPickerPanel');
  if (panel) panel.classList.remove('open');
});

