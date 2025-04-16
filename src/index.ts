import './index.css';
import { debounce } from 'debounce';
import type { API, PatternPasteEventDetail } from '@editorjs/editorjs';

/**
 * @description Iframely Tool data
 */
export interface IframelyData {
  /** Content caption */
  caption?: string;
  /** Embedded content HTML */
  html?: string;
  /** Service key */
  key?: string;
  /** Service provider */
  provider?: string;
  /** Source URL of embedded content */
  url?: string;
}

/**
 * @description Iframely tool configuration object
 */
interface IframelyConfig {
  /** Additional services provided by user */
  services?: any;
}

/**
 * @description CSS object
 */
interface CSS {
  /** Base class for CSS */
  baseClass: string;
  /** CSS class for input */
  input: string;
  /** CSS class for container */
  container: string;
  /** CSS class for loading container */
  containerLoading: string;
  /** CSS class for preloader */
  preloader: string;
  /** CSS class for caption */
  caption: string;
  /** CSS class for URL */
  url: string;
  /** CSS class for content */
  content: string;
}

interface ConstructorArgs {
  // data — previously saved data
  data: IframelyData;
  // api - Editor.js API
  api: API;
  // readOnly - read-only mode flag
  readOnly: boolean;
}

/**
 * @class Iframely
 * @classdesc Iframely Tool for Editor.js 2.0
 *
 * @property {object} api - Editor.js API
 * @property {IframelyData} _data - private property with Iframely data
 * @property {HTMLElement} element - embedded content container
 *
 * @property {object} services - static property with available services
 * @property {object} patterns - static property with patterns for paste handling configuration
 */
export default class Iframely {
  /** Editor.js API */
  private api: API;
  /** Private property with Iframely data */
  private _data: IframelyData;
  /** Embedded content container */
  private element: HTMLElement | null;
  /** Read-only mode flag */
  private readOnly: boolean;
  /** Static property with available services */
  static services = {
    youtube: {
      regex: /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/,
    },
    instagram: {
      regex: /^https?:\/\/(www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)\/?$/,
    },
    twitter: {
      regex: /^https?:\/\/twitter\.com\/[a-zA-Z0-9_]+\/status\/([0-9]+)$/,
    },
    facebook: {
      regex: /^https?:\/\/(www\.)?facebook\.com\/([a-zA-Z0-9_]+)\/posts\/([0-9]+)$/,
    },
    tiktok: {
      regex: /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_]+\/video\/([0-9]+)$/,
    },
  };
  /** Static property with patterns for paste handling configuration */
  static patterns: { [key: string]: RegExp };
  /**
   * @param {{data: IframelyData, config: IframelyConfig, api: object}}
   *   data — previously saved data
   *   config - user config for Tool
   *   api - Editor.js API
   *   readOnly - read-only mode flag
   */
  constructor({ data, api, readOnly }: ConstructorArgs) {
    this.api = api;
    this._data = {} as IframelyData;
    this.element = null;
    this.readOnly = readOnly;

    this.data = data;
  }

  /**
   * @param {IframelyData} data - iframely data
   */
  set data(data: IframelyData) {
    if (!(data instanceof Object)) {
      throw Error('Iframely Tool data should be object');
    }

    this._data = {
      caption: data.caption || '',
      html: data.html || '',
      key: data.key || '',
      provider: data.provider || '',
      url: data.url || '',
    };

    const oldView = this.element;

    if (oldView) {
      oldView.parentNode?.replaceChild(this.render(), oldView);
    }
  }

  /**
   * @returns {IframelyData}
   */
  get data(): IframelyData {
    if (this.element) {
      const caption = this.element.querySelector(`.${this.api.styles.input}`) as HTMLElement;

      this._data.caption = caption ? caption.innerHTML : '';
    }

    return this._data;
  }

  /**
   * Get plugin styles
   *
   * @returns {object}
   */
  get CSS(): CSS {
    return {
      baseClass: this.api.styles.block,
      input: this.api.styles.input,
      container: 'iframely-tool',
      containerLoading: 'iframely-tool--loading',
      preloader: 'iframely-tool__preloader',
      caption: 'iframely-tool__caption',
      url: 'iframely-tool__url',
      content: 'iframely-tool__content',
    };
  }

  /**
   * Render Iframely tool content
   *
   * @returns {HTMLElement}
   */
  render(): HTMLElement {
    const container = document.createElement('div');
    container.classList.add(this.CSS.baseClass, this.CSS.container);

    // Если нет html, показываем поле для ввода ссылки
    if (!this.data.html) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Вставьте ссылку на пост, видео и т.д.';
      input.className = 'cdx-input';
      input.value = this.data.url || '';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Вставить';
      button.className = 'cdx-button';
      const error = document.createElement('div');
      error.style.color = 'red';
      error.style.marginTop = '8px';
      error.style.fontSize = '13px';

      const onSubmit = async () => {
        const url = input.value.trim();
        if (!url) return;
        error.textContent = '';
        button.disabled = true;
        button.textContent = 'Загрузка...';
        try {
          let provider = null;
          let key = null;
          for (const [service, config] of Object.entries(Iframely.services)) {
            if (typeof config !== 'object' || !config.regex) continue;
            const match = config.regex.exec(url);
            if (match) {
              provider = service;
              key = match[1] || null;
              break;
            }
          }
          await this.handleIframelyFetch(url, provider, key);
          if (this.data.html) {
            // Перерисовать блок
            const newNode = this.render();
            container.replaceWith(newNode);
          } else {
            error.textContent = 'Не удалось получить embed-код для этой ссылки.';
          }
        } catch (e) {
          error.textContent = 'Ошибка: ' + (e.message || e);
        } finally {
          button.disabled = false;
          button.textContent = 'Вставить';
        }
      };
      button.onclick = onSubmit;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        }
      };
      container.appendChild(input);
      container.appendChild(button);
      container.appendChild(error);
      return container;
    }

    // Если html уже есть — рендерим embed и caption
    const template = document.createElement('template');
    template.innerHTML = this.data.html || '';
    container.appendChild(template.content.firstChild || document.createElement('div'));
    const caption = document.createElement('div');
    caption.classList.add(this.CSS.input, this.CSS.caption);
    caption.contentEditable = (!this.readOnly).toString();
    caption.dataset.placeholder = this.api.i18n.t('Enter a caption');
    caption.innerHTML = this.data.caption || '';
    container.appendChild(caption);
    this.element = container;
    return container;
  }

  /**
   * Handle pasted url and return Service object
   *
   * @param {PasteEvent} event - event with pasted data
   */
  onPaste(event: { detail: { data: string } }) {
    const url = event.detail.data;
    let provider = null;
    let key = null;
    for (const [service, config] of Object.entries(Iframely.services)) {
      if (typeof config !== 'object' || !config.regex) continue;
      const match = config.regex.exec(url);
      if (match) {
        provider = service;
        key = match[1] || null;
        break;
      }
    }
    this.handleIframelyFetch(url, provider, key);
  }

  async handleIframelyFetch(url: string, provider: string|null, key: string|null) {
    const iframelyApiKey = '2142942481b218a645897e';
    const apiUrl = `https://iframe.ly/api/iframely?url=${encodeURIComponent(url)}&api_key=${iframelyApiKey}&iframe=0`;
    console.log('[Iframely] iframely: fetch', apiUrl);
    try {
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      if (data && data.html) {
        console.log('[Iframely] iframely: got html');
        this.data = {
          caption: '',
          html: data.html,
          key: key || '',
          provider: provider || '',
          url,
        };
      } else {
        console.warn('[Iframely] iframely: no html in response', data);
      }
    } catch (err) {
      console.error('[Iframely] iframely: fetch error', err);
    }
  }

  /**
   * Save current content and return IframelyData object
   *
   * @returns {IframelyData}
   */
  save() {
    const captionElement = this.element?.querySelector(`.${this.CSS.input}.${this.CSS.caption}`) as HTMLElement | null;
    if (captionElement) {
      this._data.caption = captionElement.innerHTML;
    }
    return {
      caption: this._data.caption,
      html: this._data.html,
      key: this._data.key,
      provider: this._data.provider,
      url: this._data.url,
    };
  }

  /**
   * Paste configuration to enable pasted URLs processing by Editor
   *
   * @returns {object} - object of patterns which contain regx for pasteConfig
   */
  static get pasteConfig() {
    return {
      patterns: Iframely.patterns,
    };
  }

  /**
   * Notify core that read-only mode is supported
   *
   * @returns {boolean}
   */
  static get isReadOnlySupported() {
    return true;
  }
}