import { LitElement, html, customElement, property, TemplateResult, PropertyValues, state } from 'lit-element';
import deepClone from 'deep-clone-simple';
import { computeCardSize, HomeAssistant, LovelaceCard } from 'custom-card-helpers';

import { ConfigTemplateConfig } from './types';
import { CARD_VERSION } from './const';

/* eslint no-console: 0 */
console.info(
  `%c  CONFIG-TEMPLATE-CARD  \n%c  Version ${CARD_VERSION}         `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

@customElement('config-template-card')
export class ConfigTemplateCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: ConfigTemplateConfig;
  @state() private _helpers?: any;
  private _initialized = false;

  public setConfig(config: ConfigTemplateConfig): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }

    if (!config.card && !config.row && !config.element) {
      throw new Error('No card or row or element defined');
    }

    if (config.card && !config.card.type) {
      throw new Error('No card type defined');
    }

    if (config.card && config.card.type === 'picture-elements') {
      console.warn(
        'WARNING: config-template-card should not be used with the picture-elements card itself. Instead use it as one of the elements. Check the README for details',
      );
    }

    if (config.element && !config.element.type) {
      throw new Error('No element type defined');
    }

    //if (!config.entities) {
    //  throw new Error('No entities defined');
    //}

    this._config = config;

    this.loadCardHelpers();
  }

  private getLovelace() {
    let root: any = document.querySelector('home-assistant');
    root = root && root.shadowRoot;
    root = root && root.querySelector('home-assistant-main');
    root = root && root.shadowRoot;
    root = root && root.querySelector('ha-drawer partial-panel-resolver');
    root = root && root.shadowRoot || root;
    root = root && root.querySelector('ha-panel-lovelace');
    root = root && root.shadowRoot;
    root = root && root.querySelector('hui-root');
    if (root) {
      const ll = root.lovelace;
      ll.current_view = root.___curView;
      return ll;
    }
  }

  private getLovelacePanelConfig() {
    const lovelace = this.getLovelace();

    if (lovelace && lovelace.config && lovelace.config.config_template_card_vars) {
      return lovelace.config.config_template_card_vars;
    }

    return {};
  }

  private getLovelaceViewConfig() {
    const lovelace = this.getLovelace();

    if (lovelace && lovelace.config && lovelace.current_view && lovelace.config.views[lovelace.current_view] && lovelace.config.views[lovelace.current_view].config_template_card_vars) {
      return lovelace.config.views[lovelace.current_view].config_template_card_vars;
    }

    return {};
  }

  private getLovelacePanelEntities() {
    const lovelace = this.getLovelace();

    if (lovelace && lovelace.config && lovelace.config.config_template_card_entities) {
      return lovelace.config.config_template_card_entities;
    }

    return [];
  }

  private getLovelaceViewEntities() {
    const lovelace = this.getLovelace();

    if (lovelace && lovelace.config && lovelace.current_view && lovelace.config.views[lovelace.current_view] && lovelace.config.views[lovelace.current_view].config_template_card_entities) {
      return lovelace.config.views[lovelace.current_view].config_template_card_entities;
    }

    return [];
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this._initialized) {
      this._initialize();
    }

    if (changedProps.has('_config')) {
      return true;
    }

    if (this._config) {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;

      if (oldHass) {
        const entities: string[] = this._config.entities ? [...this._config.entities] : [];
        entities.push(...this.getLovelacePanelEntities());
        entities.push(...this.getLovelaceViewEntities());

        for (const entity of entities) {
          const evaluatedTemplate = this._evaluateTemplate(entity);
          if (Boolean(this.hass && oldHass.states[evaluatedTemplate] !== this.hass.states[evaluatedTemplate])) {
            return true;
          }
        }
        return false;
      }
    }

    return true;
  }

  public getCardSize(): number | Promise<number> {
    if (this.shadowRoot) {
      const element = this.shadowRoot.querySelector('#card > *') as LovelaceCard;
      if (element) {
        console.log('computeCardSize is ' + computeCardSize(element));
        return computeCardSize(element);
      }
    }

    return 1;
  }

  protected render(): TemplateResult | void {
    if (
      !this._config ||
      !this.hass ||
      !this._helpers ||
      (!this._config.card && !this._config.row && !this._config.element)
    ) {
      return html``;
    }

    let config = this._config.card
      ? deepClone(this._config.card)
      : this._config.row
      ? deepClone(this._config.row)
      : deepClone(this._config.element);

    let style = this._config.style ? deepClone(this._config.style) : {};

    config = this._evaluateConfig(config);
    if (style) {
      style = this._evaluateConfig(style);
    }

    const element = this._config.card
      ? this._helpers.createCardElement(config)
      : this._config.row
      ? this._helpers.createRowElement(config)
      : this._helpers.createHuiElement(config);
    element.hass = this.hass;

    if (this._config.element) {
      if (style) {
        Object.keys(style).forEach(prop => {
          this.style.setProperty(prop, style[prop]);
        });
      }
      if (config.style) {
        Object.keys(config.style).forEach(prop => {
          element.style.setProperty(prop, config.style[prop]);
        });
      }
    }

    return html`
      <div id="card">
        ${element}
      </div>
    `;
  }

  private _initialize(): void {
    if (this.hass === undefined) return;
    if (this._config === undefined) return;
    if (this._helpers === undefined) return;
    this._initialized = true;
  }

  private async loadCardHelpers(): Promise<void> {
    this._helpers = await (window as any).loadCardHelpers();
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private _evaluateConfig(config: any): any {
    Object.entries(config).forEach(entry => {
      const key = entry[0];
      const value = entry[1];

      if (value !== null) {
        if (value instanceof Array) {
          config[key] = this._evaluateArray(value);
        } else if (typeof value === 'object') {
          config[key] = this._evaluateConfig(value);
        } else if (typeof value === 'string' && value.includes('${')) {
          config[key] = this._evaluateTemplate(value);
        }
      }
    });

    return config;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private _evaluateArray(array: any): any {
    for (let i = 0; i < array.length; ++i) {
      const value = array[i];
      if (value instanceof Array) {
        array[i] = this._evaluateArray(value);
      } else if (typeof value === 'object') {
        array[i] = this._evaluateConfig(value);
      } else if (typeof value === 'string' && value.includes('${')) {
        array[i] = this._evaluateTemplate(value);
      }
    }

    return array;
  }

  private _evaluateTemplate(template: string): string {
    if (!template.includes('${')) {
      return template;
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const user = this.hass ? this.hass.user : undefined;
    const states = this.hass ? this.hass.states : undefined;
    const vars: any[] = [];
    const namedVars: { [key: string]: any } = {};
    const arrayVars: string[] = [];
    let varDef = '';

    const panelVars = this.getLovelacePanelConfig();

    if (panelVars) {
      if (Array.isArray(panelVars)) {
        arrayVars.push(...panelVars);
      } else {
        Object.assign(namedVars, panelVars);
      }
    }

    const viewVars = this.getLovelaceViewConfig();

    if (viewVars) {
      if (Array.isArray(viewVars)) {
        arrayVars.push(...viewVars);
      } else {
        Object.assign(namedVars, viewVars);
      }
    }

    if (this._config) {
      if (Array.isArray(this._config.variables)) {
        arrayVars.push(...this._config.variables);
      } else {
        Object.assign(namedVars, this._config.variables);
      }
    }

    for (const v in arrayVars) {
      const newV = eval(arrayVars[v]);
      vars.push(newV);
    }

    for (const varName in namedVars) {
      const newV = eval(namedVars[varName]);
      vars[varName] = newV;
      // create variable definitions to be injected:
      varDef = varDef + `var ${varName} = vars['${varName}'];\n`;
    }

    return eval(varDef + template.substring(2, template.length - 1));
  }
}
