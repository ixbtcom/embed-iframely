import SERVICES from './services';
import './index.css';
import { debounce } from 'debounce';
import type { ServiceConfig, ServicesConfigType } from './serviceConfig';
import type { API, PatternPasteEventDetail } from '@editorjs/editorjs';

/**
 * @description Embed Tool data
 */
export interface EmbedData {
  /** Service name */
  service: string;
  /** Source URL of embedded content */
  source: string;
  /** URL to source embed page */
  embed?: string;
  /** Fetched HTML content */
  html?: string;
  /** Embedded content width */
  width?: number;
  /** Embedded content height */
  height?: number;
  /** Content caption */
  caption?: string;
  /** Flag to indicate if data needs fetching */
  needsFetching?: boolean;
}

/**
 * @description Embed tool configuration object
 */
interface EmbedConfig {
  /** Service configuration object or boolean map */
  services?: ServicesConfigType | { [key: string]: boolean };
  /** Iframely API key */
  iframelyApiKey?: string;
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
  data: Partial<EmbedData>;
  // config - user config for Tool
  config: EmbedConfig;
  // api - Editor.js API
  api: API;
  // readOnly - read-only mode flag
  readOnly: boolean;
}

/**
 * @class Embed
 * @classdesc Embed Tool for Editor.js 2.0
 *
 * @property {object} api - Editor.js API
 * @property {EmbedData} _data - private property with Embed data
 * @property {HTMLElement} element - embedded content container
 *
 * @property {object} services - static property with available services
 * @property {object} patterns - static property with patterns for paste handling configuration
 */
export default class Embed {
  /** Editor.js API */
  private api: API;
  /** Private property with Embed data */
  private _data: EmbedData;
  /** Embedded content container */
  private element: HTMLElement | null;
  /** Read-only mode flag */
  private readOnly: boolean;
  /** Embed tool config */
  private config: EmbedConfig;
  /** Static property with available services */
  static services: { [key: string]: ServiceConfig };
  /** Static property with patterns for paste handling configuration */
  static patterns: { [key: string]: RegExp };
  /**
   * @param {{data: EmbedData, config: EmbedConfig, api: object}}
   *   data — previously saved data
   *   config - user config for Tool
   *   api - Editor.js API
   *   readOnly - read-only mode flag
   */
  constructor({ data, config, api, readOnly }: ConstructorArgs) {
    this.api = api;
    this.config = config; // Store config
    this._data = { ...data } as EmbedData;
    this.element = null;
    this.readOnly = readOnly;
    // Логируем наличие и значение ключа Iframely
    console.log('[Embed] iframelyApiKey:', this.config.iframelyApiKey);
  }

  /**
   * @param {EmbedData} data - embed data
   * @param {RegExp} [data.regex] - pattern of source URLs
   * @param {string} [data.embedUrl] - URL scheme to embedded page. Use '<%= remote_id %>' to define a place to insert resource id
   * @param {string} [data.html] - iframe which contains embedded content
   * @param {number} [data.height] - iframe height
   * @param {number} [data.width] - iframe width
   * @param {string} [data.caption] - caption
   */
  set data(data: EmbedData) {
    // Merge new data with existing data
    const newData = { ...this._data, ...data };
    this._data = { ...newData };

    const oldView = this.element;

    if (oldView) {
      oldView.parentNode?.replaceChild(this.render(), oldView);
    }
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
      container: 'embed-tool',
      containerLoading: 'embed-tool--loading',
      preloader: 'embed-tool__preloader',
      caption: 'embed-tool__caption',
      url: 'embed-tool__url',
      content: 'embed-tool__content',
    };
  }

  /**
   * Render Embed tool content
   *
   * @returns {HTMLElement}
   */
  render(): HTMLElement {
    console.log('[Embed] render data:', this.data);
    // Защита от некорректных данных
    if (!this.data || !this.data.service) {
      const container = document.createElement('div');
      container.textContent = 'Invalid embed data';
      return container;
    }

    // Для iframelyRuSocial и iframelyService вызываем fetchIframelyData
    if ((this.data.service === 'iframelyService' || this.data.service === 'iframelyRuSocial') && this.data.needsFetching) {
      const container = document.createElement('div');
      container.classList.add(this.CSS.baseClass, this.CSS.container, this.CSS.containerLoading);
      container.appendChild(this.createPreloader());
      this.element = container;
      this.fetchIframelyData(this.data.source);
      return container;
    }

    // Стандартный рендер для обычных сервисов
    const container = document.createElement('div');
    container.classList.add(this.CSS.baseClass, this.CSS.container);
    const caption = document.createElement('div');
    caption.classList.add(this.CSS.input, this.CSS.caption);
    caption.contentEditable = (!this.readOnly).toString();
    caption.dataset.placeholder = this.api.i18n.t('Enter a caption');
    caption.innerHTML = this.data.caption || '';

    if (this.data.html) {
      // Если есть готовый HTML (Iframely)
      const template = document.createElement('template');
      template.innerHTML = this.data.html;
      if (template.content.firstChild) {
        container.appendChild(template.content.firstChild);
      }
    } else if (this.data.embed) {
      // Обычный iframe embed
      const iframe = document.createElement('iframe');
      iframe.src = this.data.embed;
      iframe.width = (this.data.width || 580).toString();
      iframe.height = (this.data.height || 320).toString();
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.style.width = '100%';
      container.appendChild(iframe);
    }
    container.appendChild(caption);
    this.element = container;
    return container;
  }

  /**
   * Creates preloader to append to container while data is loading
   *
   * @returns {HTMLElement}
   */
  createPreloader(): HTMLElement {
    const preloader = document.createElement('preloader');
    const url = document.createElement('div');

    url.textContent = this.data.source || 'Loading...';

    preloader.classList.add(this.CSS.preloader);
    url.classList.add(this.CSS.url);

    preloader.appendChild(url);

    return preloader;
  }

  /**
   * Save current content and return EmbedData object
   *
   * @returns {EmbedData}
   */
  save(): EmbedData {
    // Ensure caption is updated from the DOM before saving
    const captionElement = this.element?.querySelector(`.${this.CSS.input}.${this.CSS.caption}`) as HTMLElement | null;
    if (captionElement) {
      this._data.caption = captionElement.innerHTML;
    }

    // Return the complete data object, potentially removing the fetch flag
    const { needsFetching, ...dataToSave } = this._data;
    console.log('Saving Embed data:', dataToSave);
    return dataToSave;
  }

  /**
   * Validate Embed block data:
   * - For Iframely, check if service is 'iframelyService' and html/source are present.
   * - For others, check if service and source/embed are present.
   */
  validate(savedData: EmbedData): boolean {
    if (savedData.service === 'iframelyService' || savedData.service === 'iframelyRuSocial') {
      const isValid = typeof savedData.source === 'string' && savedData.source.length > 0 &&
                      typeof savedData.html === 'string' && savedData.html.length > 0;
      if (!isValid) {
        console.warn('Iframely embed validation failed:', savedData);
      }
      return isValid;
    } else {
      // Оригинальная логика для стандартных сервисов
      const isValid = typeof savedData.service === 'string' && savedData.service.length > 0 &&
                      (typeof savedData.source === 'string' && savedData.source.length > 0 ||
                       typeof savedData.embed === 'string' && savedData.embed.length > 0);
      if (!isValid) {
        console.warn('Standard embed validation failed:', savedData);
      }
      return isValid;
    }
  }

  /**
   * Handle pasted url and return Service object
   *
   * @param {PasteEvent} event - event with pasted data
   */
  onPaste(event: { detail: PatternPasteEventDetail }): void {
    console.log('[Embed] onPaste event:', event);
    const { key: serviceKey, data: url } = event.detail;
    console.log('[Embed] onPaste: serviceKey =', serviceKey, 'url =', url);
    const service = Embed.services[serviceKey];

    if (serviceKey === 'iframelyRuSocial') {
      // Обработка через Iframely
      this.data = {
        service: serviceKey,
        source: url,
        embed: '',
        html: '',
        needsFetching: true,
      } as EmbedData;
      console.log('[Embed] after onPaste, data:', this.data);
      return;
    }

    if (service.useIframelyAPI) {
      this.data = {
        service: serviceKey,
        source: url,
        embed: '',
        html: '',
        needsFetching: true,
      } as EmbedData;
      console.log('[Embed] after onPaste, data:', this.data);
    } else {
      // Оригинальная логика
      const { regex, embedUrl, width, height, id = (ids) => ids.shift() || '' } = service;
      const result = regex.exec(url)?.slice(1);
      const embed = result ? embedUrl.replace(/<%= remote_id %>/g, id(result)) : '';

      this.data = {
        service: serviceKey,
        source: url,
        embed,
        width,
        height,
      };
      console.log('[Embed] after onPaste, data:', this.data);
    }
  }

  /**
   * Fetches embed data from Iframely API.
   * @param sourceUrl - The URL to fetch embed data for.
   */
  async fetchIframelyData(sourceUrl: string): Promise<void> {
    if (!this.config.iframelyApiKey) {
      console.error('Iframely API key is not configured.');
      // Maybe show an error state in the UI?
      return;
    }

    const apiUrl = `https://iframe.ly/api/iframely?url=${encodeURIComponent(sourceUrl)}&key=${this.config.iframelyApiKey}`;

    console.log('[Embed] Fetching Iframely data from:', apiUrl);

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Embed] Iframely API error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('[Embed] Iframely API response:', data);

      if (!data || !data.html) {
        console.warn('Iframely API returned no HTML for URL:', sourceUrl, 'Response:', data);
        throw new Error('No HTML content found for this URL.');
      }

      console.log('Iframely data fetched successfully:', data);

      // Update internal data and trigger re-render via setter
      this.data = {
        ...this._data, // Keep existing data like source, service
        html: data.html,
        embed: data.links?.player?.[0]?.href || data.url, // Try to get player link or fallback to original url
        // Optionally store other meta if needed (e.g., title, description)
        // title: data.meta?.title,
        // description: data.meta?.description,
        needsFetching: false, // Mark as fetched
      };

    } catch (error) {
      console.error('Failed to fetch Iframely data:', error);
      // Show error state?
      // Optionally update data to reflect error state
      this.data = {
        ...this._data,
        html: '<p>Error loading embed.</p>', // Show error message
        needsFetching: false,
      };
    }
  }

  /**
   * Analyze provided config and make object with services to use
   *
   * @param {EmbedConfig} config - configuration of embed block element
   */
  static prepare({ config = {} }: { config: EmbedConfig }): void {
    const { services = {}, iframelyApiKey } = config;

    let entries = Object.entries(SERVICES);

    const enabledServices = Object
      .entries(services)
      .filter(([key, value]) => {
        return typeof value === 'boolean' && value === true;
      })
      .map(([ key ]) => key);

    const userServices = Object
      .entries(services)
      .filter(([key, value]) => {
        return typeof value === 'object';
      })
      .filter(([key, service]) => Embed.checkServiceConfig(service as ServiceConfig))
      .map(([key, service]) => {
        const { regex, embedUrl, html, height, width, id } = service as ServiceConfig;

        return [key, {
          regex,
          embedUrl,
          html,
          height,
          width,
          id,
        } ] as [string, ServiceConfig];
      });

    if (enabledServices.length) {
      entries = entries.filter(([ key ]) => enabledServices.includes(key));
    }

    entries = entries.concat(userServices);

    const result: { [key: string]: ServiceConfig } = {};

    // Сначала стандартные сервисы
    Object.entries(SERVICES).forEach(([key, val]) => {
      if (userServices.find(([k, v]) => k === key)) {
        result[key] = userServices.find(([k, v]) => k === key)?.[1] as ServiceConfig;
      } else if (enabledServices.includes(key)) {
        result[key] = val as ServiceConfig;
      }
    });

    // Потом iframelyService, если включен
    if (iframelyApiKey && userServices.find(([k, v]) => k === 'iframelyService')) {
      result['iframelyService'] = {
        regex: /^https?:\/\/.+/, // Match any http/https URL
        useIframelyAPI: true, // Custom flag
        embedUrl: '', // Dummy value
        html: '<div class="cdx-block embed-tool__content"></div>'
      } as ServiceConfig;
    }

    Embed.services = result;

    Embed.patterns = Object.entries(Embed.services)
      .reduce<{ [key: string]: RegExp }>((result, [key, item]) => {
        if (item && typeof item !== 'boolean') {
          result[key] = (item as ServiceConfig).regex as RegExp;
        }

        return result;
      }, {});
  }

  /**
   * Check if Service config is valid
   *
   * @param {Service} config - configuration of embed block element
   * @returns {boolean}
   */
  static checkServiceConfig(config: ServiceConfig): boolean {
    const { regex, embedUrl, html, height, width, id, useIframelyAPI } = config;

    let isValid = Boolean(regex && regex instanceof RegExp) &&
      Boolean(embedUrl && typeof embedUrl === 'string') &&
      Boolean(html && typeof html === 'string');

    isValid = isValid && (id !== undefined ? id instanceof Function : true);
    isValid = isValid && (height !== undefined ? Number.isFinite(height) : true);
    isValid = isValid && (width !== undefined ? Number.isFinite(width) : true);
    isValid = isValid && (useIframelyAPI !== undefined ? typeof useIframelyAPI === 'boolean' : true);

    return isValid;
  }

  /**
   * Paste configuration to enable pasted URLs processing by Editor
   *
   * @returns {object} - object of patterns which contain regx for pasteConfig
   */
  static get pasteConfig() {
    return {
      patterns: Embed.patterns,
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

  /**
   * Checks that mutations in DOM have finished after appending iframe content
   *
   * @param {HTMLElement} targetNode - HTML-element mutations of which to listen
   * @returns {Promise<any>} - result that all mutations have finished
   */
  embedIsReady(targetNode: HTMLElement): Promise<void> {
    const PRELOADER_DELAY = 450;

    let observer: MutationObserver;

    return new Promise((resolve, reject) => {
      observer = new MutationObserver(debounce(resolve, PRELOADER_DELAY));
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
      });
    }).then(() => {
      observer.disconnect();
    });
  }
}
