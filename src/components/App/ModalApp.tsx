import { h, Component } from 'preact'
import { EventEmitter2 } from 'eventemitter2'

import { SdkOptionsProvider } from '~contexts/useSdkOptions'
import { LocaleProvider } from '~locales'
import { getEnabledDocuments } from '~utils'
import {
  parseJwt,
  getUrlsFromJWT,
  getEnterpriseFeaturesFromJWT,
} from '~utils/jwt'
import Modal from '../Modal'
import Router from '../Router'
import * as Tracker from '../../Tracker'
import { getCountryDataForDocumentType } from '../../supported-documents'

import type { NormalisedSdkOptions } from '~types/commons'
import type {
  EnterpriseFeatures,
  EnterpriseCobranding,
  EnterpriseLogoCobranding,
} from '~types/enterprise'
import type { ReduxProps } from '~types/routers'
import type {
  SdkOptions,
  SdkError,
  SdkResponse,
  UserExitCode,
} from '~types/sdk'
import type {
  StepTypes,
  StepConfig,
  StepConfigDocument,
  DocumentTypes,
  StepConfigFace,
} from '~types/steps'
import { setCobrandingLogos, setUICustomizations } from '../Theme/utils'

import withConnect from './withConnect'

export type ModalAppProps = {
  options: NormalisedSdkOptions
}

type Props = ModalAppProps & ReduxProps

class ModalApp extends Component<Props> {
  private events: EventEmitter2.emitter

  constructor(props: Props) {
    super(props)
    this.events = new EventEmitter2()
    this.events.on('complete', this.trackOnComplete)
    if (!props.options.disableAnalytics) {
      Tracker.setUp()
      Tracker.install()
    }
    this.bindEvents(
      props.options.onComplete,
      props.options.onError,
      props.options.onUserExit
    )
  }

  componentDidMount() {
    const { options } = this.props
    this.prepareInitialStore({ steps: [] }, options)
    if (!options.mobileFlow) {
      const { customUI } = options
      const hasCustomUIConfigured =
        !!customUI && Object.keys(customUI).length > 0
      const trackedProperties = {
        is_custom_ui: hasCustomUIConfigured,
      }
      Tracker.sendEvent('started flow', trackedProperties)
    }
  }

  componentDidUpdate(prevProps: Props) {
    this.jwtValidation(prevProps.options, this.props.options)
    this.prepareInitialStore(prevProps.options, this.props.options)
    this.rebindEvents(prevProps.options, this.props.options)
  }

  componentWillUnmount() {
    this.props.socket && this.props.socket.close()
    this.events.removeAllListeners(['complete', 'error'])
    Tracker.uninstall()
  }

  jwtValidation = (
    prevOptions: NormalisedSdkOptions,
    newOptions: NormalisedSdkOptions
  ) => {
    if (prevOptions.token !== newOptions.token) {
      try {
        parseJwt(newOptions.token)
      } catch {
        this.onInvalidJWT('Invalid token')
      }
    }
  }

  onInvalidJWT = (message: string) => {
    this.events.emit('error', { type: 'exception', message })
  }

  onInvalidEnterpriseFeatureException = (feature: string) => {
    const message = `EnterpriseFeatureNotEnabledException: Enterprise feature ${feature} not enabled for this account.`
    this.events.emit('error', { type: 'exception', message })
    Tracker.trackException(message)
  }

  onInvalidCustomApiException = (callbackName: string) => {
    const message = `CustomApiException: ${callbackName} must be a function that returns a promise for useCustomizedApiRequests to work properly.`
    this.events.emit('error', { type: 'exception', message })
    Tracker.trackException(message)
  }

  trackOnComplete = () => Tracker.sendEvent('completed flow')

  bindEvents = (
    onComplete?: (data: SdkResponse) => void,
    onError?: (error: SdkError) => void,
    onUserExit?: (error: UserExitCode) => void
  ) => {
    onComplete && this.events.on('complete', onComplete)
    onError && this.events.on('error', onError)
    onUserExit && this.events.on('userExit', onUserExit)
  }

  rebindEvents = (
    oldOptions: NormalisedSdkOptions,
    newOptions: NormalisedSdkOptions
  ) => {
    oldOptions.onComplete && this.events.off('complete', oldOptions.onComplete)
    oldOptions.onError && this.events.off('error', oldOptions.onError)
    oldOptions.onUserExit && this.events.off('userExit', oldOptions.onUserExit)

    this.bindEvents(
      newOptions.onComplete,
      newOptions.onError,
      newOptions.onUserExit
    )
  }

  setIssuingCountryIfConfigured = (
    steps: Array<StepTypes | StepConfig>,
    preselectedDocumentType: DocumentTypes
  ) => {
    const documentStep = steps.find(
      (step) => typeof step !== 'string' && step.type === 'document'
    ) as StepConfigDocument

    if (typeof documentStep === 'string' || !documentStep.options) {
      return
    }

    const docTypes = documentStep.options.documentTypes
    const preselectedDocumentTypeConfig = docTypes
      ? docTypes[preselectedDocumentType]
      : undefined

    if (typeof preselectedDocumentTypeConfig === 'boolean') {
      return
    }

    const countryCode = preselectedDocumentTypeConfig?.country
    const supportedCountry = getCountryDataForDocumentType(
      countryCode,
      preselectedDocumentType
    )

    if (supportedCountry) {
      this.props.actions.setIdDocumentIssuingCountry(supportedCountry)
    } else if (countryCode !== null) {
      // Integrators can set document type country to null to suppress Country Selection without setting a country
      // Anything else is an invalid country code
      console.error('Unsupported countryCode:', countryCode)
    }
  }

  prepareInitialStore = (
    prevOptions: NormalisedSdkOptions,
    options: NormalisedSdkOptions
  ) => {
    const { token, userDetails: { smsNumber } = {}, steps, customUI } = options
    const {
      userDetails: { smsNumber: prevSmsNumber } = {},
      steps: prevSteps,
      token: prevToken,
      customUI: prevCustomUI,
    } = prevOptions

    if (smsNumber && smsNumber !== prevSmsNumber) {
      this.props.actions.setMobileNumber(smsNumber)
    }

    if (steps && steps !== prevSteps) {
      const enabledDocs = getEnabledDocuments(steps) as DocumentTypes[]

      if (enabledDocs.length === 1) {
        const preselectedDocumentType = enabledDocs[0]
        this.props.actions.setIdDocumentType(preselectedDocumentType)
        this.setIssuingCountryIfConfigured(steps, preselectedDocumentType)
      }
    }

    if (token && token !== prevToken) {
      const isDesktopFlow = !options.mobileFlow
      if (isDesktopFlow) {
        this.setUrls(token)
      }

      const validEnterpriseFeatures = getEnterpriseFeaturesFromJWT(token)
      this.setConfiguredEnterpriseFeatures(validEnterpriseFeatures, options)
    }

    if (customUI && customUI !== prevCustomUI) {
      setUICustomizations(customUI)
    }
  }

  setConfiguredEnterpriseFeatures = (
    validEnterpriseFeatures: EnterpriseFeatures,
    options: SdkOptions
  ) => {
    const hideOnfidoLogo = options.enterpriseFeatures?.hideOnfidoLogo
    if (hideOnfidoLogo) {
      this.hideDefaultLogoIfClientHasFeature(
        validEnterpriseFeatures.hideOnfidoLogo
      )
    } else if (!options.mobileFlow) {
      this.props.actions.hideOnfidoLogo(false)
    }

    const cobrandConfig = options.enterpriseFeatures?.cobrand
    if (!hideOnfidoLogo && cobrandConfig) {
      this.displayCobrandIfClientHasFeature(
        validEnterpriseFeatures.cobrand,
        cobrandConfig
      )
    }

    const logoCobrandConfig = options.enterpriseFeatures?.logoCobrand
    if (!hideOnfidoLogo && !cobrandConfig && logoCobrandConfig) {
      this.displayLogoCobrandIfClientHasFeature(
        validEnterpriseFeatures.logoCobrand,
        logoCobrandConfig
      )
    }

    const isDecoupledFromAPI =
      options.enterpriseFeatures?.useCustomizedApiRequests
    if (isDecoupledFromAPI) {
      this.setDecoupleFromAPIIfClientHasFeature(
        validEnterpriseFeatures.useCustomizedApiRequests
      )
    }
  }

  setUrls = (token: string) => {
    const jwtUrls = getUrlsFromJWT(token)

    if (jwtUrls) {
      this.props.actions.setUrls(jwtUrls)
    }
  }

  hideDefaultLogoIfClientHasFeature = (isValidEnterpriseFeature?: boolean) => {
    if (isValidEnterpriseFeature) {
      this.props.actions.hideOnfidoLogo(true)
    } else {
      this.props.actions.hideOnfidoLogo(false)
      this.onInvalidEnterpriseFeatureException('hideOnfidoLogo')
    }
  }

  displayCobrandIfClientHasFeature = (
    isValidEnterpriseFeature: EnterpriseCobranding | null | undefined,
    cobrandConfig: EnterpriseCobranding
  ) => {
    if (isValidEnterpriseFeature) {
      this.props.actions.showCobranding(cobrandConfig)
    } else {
      this.onInvalidEnterpriseFeatureException('cobrand')
    }
  }

  displayLogoCobrandIfClientHasFeature = (
    isValidEnterpriseFeature: EnterpriseLogoCobranding | null | undefined,
    logoCobrandConfig: EnterpriseLogoCobranding
  ) => {
    if (isValidEnterpriseFeature) {
      this.props.actions.showLogoCobranding(logoCobrandConfig)
      setCobrandingLogos(logoCobrandConfig)
    } else {
      this.onInvalidEnterpriseFeatureException('logoCobrand')
    }
  }

  setDecoupleFromAPIIfClientHasFeature = (
    isValidEnterpriseFeature?: boolean
  ) => {
    if (isValidEnterpriseFeature) {
      const { onSubmitDocument, onSubmitSelfie, onSubmitVideo } =
        this.props.options.enterpriseFeatures || {}

      if (typeof onSubmitDocument !== 'function') {
        this.onInvalidCustomApiException('onSubmitDocument')
      }

      if (typeof onSubmitSelfie !== 'function') {
        this.onInvalidCustomApiException('onSubmitSelfie')
      }

      const faceStep = this.props.options.steps?.find(
        (step) => typeof step !== 'string' && step.type === 'face'
      ) as StepConfigFace

      if (faceStep?.options?.requestedVariant === 'video') {
        if (typeof onSubmitVideo !== 'function') {
          this.onInvalidCustomApiException('onSubmitVideo')
        }
      }

      this.props.actions.setDecoupleFromAPI(true)
    } else {
      this.props.actions.setDecoupleFromAPI(false)
      this.onInvalidEnterpriseFeatureException('useCustomizedApiRequests')
    }
  }

  render() {
    const { options, ...otherProps } = this.props
    const {
      useModal,
      isModalOpen,
      onModalRequestClose,
      containerId,
      containerEl,
      shouldCloseOnOverlayClick,
    } = options

    return (
      <SdkOptionsProvider options={{ ...options, events: this.events }}>
        <LocaleProvider language={options.language}>
          <Modal
            useModal={useModal}
            isOpen={isModalOpen}
            onRequestClose={onModalRequestClose}
            containerId={containerId}
            containerEl={containerEl}
            shouldCloseOnOverlayClick={shouldCloseOnOverlayClick}
          >
            <Router {...otherProps} />
          </Modal>
        </LocaleProvider>
      </SdkOptionsProvider>
    )
  }
}

export default withConnect(ModalApp)