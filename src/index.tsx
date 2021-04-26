import { h, render } from 'preact'
import { getCountryCodes } from 'react-phone-number-input/modules/countries'
import labels from 'react-phone-number-input/locale/default.json'
import 'custom-event-polyfill'

// TODO: These IE11 polyfills are missing in `development` after the Typescript conversion.
//       But on PRs where the components that use these Array methods have been converted the polyfills seem to be included.
//       Should be fine to remove when those PRs are merged in eventually.
import 'array-flat-polyfill'

import { upperCase } from '~utils/string'
import { noop } from '~utils/func'
import { cssVarsPonyfill } from '~utils/cssVarsPonyfill'
import type { NormalisedSdkOptions } from '~types/commons'
import type { SdkOptions, SdkHandle } from '~types/sdk'
import type { StepConfig, StepTypes, StepConfigDocument } from '~types/steps'
import App from './components/App'

if (process.env.NODE_ENV === 'development') {
  require('preact/debug')
}

const onfidoRender = (
  options: NormalisedSdkOptions,
  el: Element | Document | ShadowRoot | DocumentFragment,
  merge?: Element | Text
) => render(<App options={options} />, el, merge)

const defaults: SdkOptions = {
  token: undefined,
  containerId: 'onfido-mount',
  onComplete: noop,
  onError: noop,
  onUserExit: noop,
}

const formatStep = (typeOrStep: StepConfig | StepTypes): StepConfig => {
  if (typeof typeOrStep === 'string') {
    return { type: typeOrStep }
  }

  return typeOrStep
}

const formatOptions = ({
  steps,
  smsNumberCountryCode,
  ...otherOptions
}: SdkOptions): NormalisedSdkOptions => ({
  ...otherOptions,
  smsNumberCountryCode: validateSmsCountryCode(smsNumberCountryCode),
  steps: (steps || ['welcome', 'document', 'face', 'complete']).map(formatStep),
})

const experimentalFeatureWarnings = ({ steps }: NormalisedSdkOptions) => {
  const documentStep = steps?.find(
    (step) => step.type === 'document'
  ) as StepConfigDocument

  if (!documentStep) {
    return
  }

  if (documentStep.options?.useWebcam) {
    console.warn(
      '`useWebcam` is an experimental option and is currently discouraged'
    )
  }

  if (documentStep.options?.useLiveDocumentCapture) {
    console.warn(
      '`useLiveDocumentCapture` is a beta feature and is still subject to ongoing changes'
    )
  }
}

const isSMSCountryCodeValid = (smsNumberCountryCode: string) => {
  // If you need to refactor this code, remember not to introduce large libraries such as
  // libphonenumber-js in the main bundle!
  const countries = getCountryCodes(labels)
  const isCodeValid = countries.includes(smsNumberCountryCode)
  if (!isCodeValid) {
    console.warn(
      "`smsNumberCountryCode` must be a valid two-characters ISO Country Code. 'GB' will be used instead."
    )
  }
  return isCodeValid
}

const validateSmsCountryCode = (
  smsNumberCountryCode?: string
): string | undefined => {
  if (!smsNumberCountryCode) return 'GB'
  const upperCaseCode = upperCase(smsNumberCountryCode)
  return isSMSCountryCodeValid(upperCaseCode) ? upperCaseCode : 'GB'
}

const elementIsInPage = (node: HTMLElement) =>
  node === document.body ? false : document.body.contains(node)

const getContainerElementById = (containerId: string) => {
  const el = document.getElementById(containerId)

  if (el && elementIsInPage(el)) {
    return el
  }

  throw new Error(
    `Element ID ${containerId} does not exist in current page body`
  )
}

export const init = (opts: SdkOptions): SdkHandle => {
  console.log('onfido_sdk_version', process.env.SDK_VERSION)
  const options = formatOptions({ ...defaults, ...opts })

  experimentalFeatureWarnings(options)
  cssVarsPonyfill()

  let containerEl: HTMLElement

  if (options.containerEl) {
    containerEl = options.containerEl
    onfidoRender(options, containerEl)
  } else if (options.containerId) {
    containerEl = getContainerElementById(options.containerId)
    onfidoRender(options, containerEl)
  }

  return {
    options,
    setOptions(changedOptions) {
      this.options = formatOptions({ ...this.options, ...changedOptions })
      if (
        this.options.containerEl !== changedOptions.containerEl &&
        changedOptions.containerEl
      ) {
        containerEl = changedOptions.containerEl
      } else if (
        this.containerId !== changedOptions.containerId &&
        changedOptions.containerId
      ) {
        containerEl = getContainerElementById(changedOptions.containerId)
      }
      onfidoRender(this.options as NormalisedSdkOptions, containerEl)
      return this.options
    },
    tearDown() {
      render(null, containerEl)
    },
  }
}