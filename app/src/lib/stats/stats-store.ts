import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import { getDotComAPIEndpoint } from '../api'
import { getVersion } from '../../ui/lib/app-proxy'
import { hasShownWelcomeFlow } from '../welcome'
import { Account } from '../../models/account'
import { getOS } from '../get-os'
import { getGUID } from './get-guid'
import { Repository } from '../../models/repository'
import { merge } from '../../lib/merge'
import { getPersistedThemeName } from '../../ui/lib/application-theme'
import { IUiActivityMonitor } from '../../ui/lib/ui-activity-monitor'
import { Disposable } from 'event-kit'
import { SignInMethod } from '../stores'
import { assertNever } from '../fatal-error'
import {
  getNumber,
  setNumber,
  getBoolean,
  setBoolean,
  getNumberArray,
  setNumberArray,
} from '../local-storage'
import { PushOptions } from '../git'
import { getShowSideBySideDiff } from '../../ui/lib/diff-mode'
import { remote } from 'electron'
import { Architecture, getArchitecture } from '../get-architecture'

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

/** The URL to the stats samples page. */
export const SamplesURL = 'https://desktop.github.com/usage-data/'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** The localStorage key for whether the user has opted out. */
const StatsOptOutKey = 'stats-opt-out'

/** Have we successfully sent the stats opt-in? */
const HasSentOptInPingKey = 'has-sent-stats-opt-in-ping'

const WelcomeWizardInitiatedAtKey = 'welcome-wizard-initiated-at'
const WelcomeWizardCompletedAtKey = 'welcome-wizard-terminated-at'
const FirstRepositoryAddedAtKey = 'first-repository-added-at'
const FirstRepositoryClonedAtKey = 'first-repository-cloned-at'
const FirstRepositoryCreatedAtKey = 'first-repository-created-at'
const FirstCommitCreatedAtKey = 'first-commit-created-at'
const FirstPushToGitHubAtKey = 'first-push-to-github-at'
const FirstNonDefaultBranchCheckoutAtKey =
  'first-non-default-branch-checkout-at'
const WelcomeWizardSignInMethodKey = 'welcome-wizard-sign-in-method'
const terminalEmulatorKey = 'shell'
const textEditorKey: string = 'externalEditor'

const RepositoriesCommittedInWithoutWriteAccessKey =
  'repositories-committed-in-without-write-access'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

const DefaultDailyMeasures: IDailyMeasures = {
  commits: 0,
  partialCommits: 0,
  openShellCount: 0,
  coAuthoredCommits: 0,
  branchComparisons: 0,
  defaultBranchComparisons: 0,
  mergesInitiatedFromComparison: 0,
  updateFromDefaultBranchMenuCount: 0,
  mergeIntoCurrentBranchMenuCount: 0,
  prBranchCheckouts: 0,
  repoWithIndicatorClicked: 0,
  repoWithoutIndicatorClicked: 0,
  dotcomPushCount: 0,
  dotcomForcePushCount: 0,
  enterprisePushCount: 0,
  enterpriseForcePushCount: 0,
  externalPushCount: 0,
  externalForcePushCount: 0,
  active: false,
  mergeConflictFromPullCount: 0,
  mergeConflictFromExplicitMergeCount: 0,
  mergedWithLoadingHintCount: 0,
  mergedWithCleanMergeHintCount: 0,
  mergedWithConflictWarningHintCount: 0,
  mergeSuccessAfterConflictsCount: 0,
  mergeAbortedAfterConflictsCount: 0,
  unattributedCommits: 0,
  enterpriseCommits: 0,
  dotcomCommits: 0,
  mergeConflictsDialogDismissalCount: 0,
  anyConflictsLeftOnMergeConflictsDialogDismissalCount: 0,
  mergeConflictsDialogReopenedCount: 0,
  guidedConflictedMergeCompletionCount: 0,
  unguidedConflictedMergeCompletionCount: 0,
  createPullRequestCount: 0,
  rebaseConflictsDialogDismissalCount: 0,
  rebaseConflictsDialogReopenedCount: 0,
  rebaseAbortedAfterConflictsCount: 0,
  rebaseSuccessAfterConflictsCount: 0,
  rebaseSuccessWithoutConflictsCount: 0,
  pullWithRebaseCount: 0,
  pullWithDefaultSettingCount: 0,
  stashEntriesCreatedOutsideDesktop: 0,
  errorWhenSwitchingBranchesWithUncommmittedChanges: 0,
  rebaseCurrentBranchMenuCount: 0,
  stashViewedAfterCheckoutCount: 0,
  stashCreatedOnCurrentBranchCount: 0,
  stashNotViewedAfterCheckoutCount: 0,
  changesTakenToNewBranchCount: 0,
  stashRestoreCount: 0,
  stashDiscardCount: 0,
  stashViewCount: 0,
  noActionTakenOnStashCount: 0,
  suggestedStepOpenInExternalEditor: 0,
  suggestedStepOpenWorkingDirectory: 0,
  suggestedStepViewOnGitHub: 0,
  suggestedStepPublishRepository: 0,
  suggestedStepPublishBranch: 0,
  suggestedStepCreatePullRequest: 0,
  suggestedStepViewStash: 0,
  commitsToProtectedBranch: 0,
  commitsToRepositoryWithBranchProtections: 0,
  tutorialStarted: false,
  tutorialRepoCreated: false,
  tutorialEditorInstalled: false,
  tutorialBranchCreated: false,
  tutorialFileEdited: false,
  tutorialCommitCreated: false,
  tutorialBranchPushed: false,
  tutorialPrCreated: false,
  tutorialCompleted: false,
  // this is `-1` because `0` signifies "tutorial created"
  highestTutorialStepCompleted: -1,
  commitsToRepositoryWithoutWriteAccess: 0,
  forksCreated: 0,
  issueCreationWebpageOpenedCount: 0,
  tagsCreatedInDesktop: 0,
  tagsCreated: 0,
  tagsDeleted: 0,
  diffModeChangeCount: 0,
  diffOptionsViewedCount: 0,
  repositoryViewChangeCount: 0,
  unhandledRejectionCount: 0,
  cherryPickSuccessfulCount: 0,
  cherryPickViaDragAndDropCount: 0,
  cherryPickViaContextMenuCount: 0,
  cherryPickDragStartedAndCanceledCount: 0,
  cherryPickConflictsEncounteredCount: 0,
  cherryPickSuccessfulWithConflictsCount: 0,
  cherryPickMultipleCommitsCount: 0,
  cherryPickUndoneCount: 0,
  cherryPickBranchCreatedCount: 0,
}

interface IOnboardingStats {
  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user added their first existing repository.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToFirstAddedRepository?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user cloned their first repository.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToFirstClonedRepository?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user created their first new repository.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToFirstCreatedRepository?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user crafted their first commit.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToFirstCommit?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user performed their first push of a repository
   * to GitHub.com or GitHub Enterprise. This metric
   * does not track pushes to non-GitHub remotes.
   */
  readonly timeToFirstGitHubPush?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user first checked out a branch in any repository
   * which is not the default branch of that repository.
   *
   * Note that this metric will be set regardless of whether
   * that repository was a GitHub.com/GHE repository, local
   * repository or has a non-GitHub remote.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToFirstNonDefaultBranchCheckout?: number

  /**
   * Time (in seconds) from when the user first launched
   * the application and entered the welcome wizard until
   * the user completed the wizard.
   *
   * A negative value means that this action hasn't yet
   * taken place while undefined means that the current
   * user installed desktop prior to this metric being
   * added and we will thus never be able to provide a
   * value.
   */
  readonly timeToWelcomeWizardTerminated?: number

  /**
   * The method that was used when authenticating a
   * user in the welcome flow. If multiple successful
   * authentications happened during the welcome flow
   * due to the user stepping back and signing in to
   * another account this will reflect the last one.
   */
  readonly welcomeWizardSignInMethod?: 'basic' | 'web'
}

interface ICalculatedStats {
  /** The app version. */
  readonly version: string

  /** The OS version. */
  readonly osVersion: string

  /** The platform. */
  readonly platform: string

  /** The architecture. */
  readonly architecture: Architecture

  /** The number of total repositories. */
  readonly repositoryCount: number

  /** The number of GitHub repositories. */
  readonly gitHubRepositoryCount: number

  /** The install ID. */
  readonly guid: string

  /** Is the user logged in with a GitHub.com account? */
  readonly dotComAccount: boolean

  /** Is the user logged in with an Enterprise account? */
  readonly enterpriseAccount: boolean

  /**
   * The name of the currently selected theme/application
   * appearance as set at time of stats submission.
   */
  readonly theme: string

  /** The selected terminal emulator at the time of stats submission */
  readonly selectedTerminalEmulator: string

  /** The selected text editor at the time of stats submission */
  readonly selectedTextEditor: string

  readonly eventType: 'usage'

  /**
   * _[Forks]_
   * How many repos did the user commit in without having `write` access?
   *
   * This is a hack in that its really a "computed daily measure" and the
   * moment we have another one of those we should consider refactoring
   * them into their own interface
   */
  readonly repositoriesCommittedInWithoutWriteAccess: number

  /**
   * whether not to the user has chosent to view diffs in split, or unified (the
   * default) diff view mode
   */
  readonly diffMode: 'split' | 'unified'

  /**
   * Whether the app was launched from the Applications folder or not. This is
   * only relevant on macOS, null will be sent otherwise.
   */
  readonly launchedFromApplicationsFolder: boolean | null
}

type DailyStats = ICalculatedStats &
  ILaunchStats &
  IDailyMeasures &
  IOnboardingStats

/**
 * Testable interface for StatsStore
 *
 * Note: for the moment this only contains methods that are needed for testing,
 * so fight the urge to implement every public method from StatsStore here
 *
 */
export interface IStatsStore {
  recordMergeAbortedAfterConflicts: () => void
  recordMergeSuccessAfterConflicts: () => void
  recordRebaseAbortedAfterConflicts: () => void
  recordRebaseSuccessAfterConflicts: () => void
}

/** The store for the app's stats. */
export class StatsStore implements IStatsStore {
  private readonly db: StatsDatabase
  private readonly uiActivityMonitor: IUiActivityMonitor
  private uiActivityMonitorSubscription: Disposable | null = null

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  public constructor(db: StatsDatabase, uiActivityMonitor: IUiActivityMonitor) {
    this.db = db
    this.uiActivityMonitor = uiActivityMonitor

    const storedValue = getHasOptedOutOfStats()

    this.optOut = storedValue || false

    // If the user has set an opt out value but we haven't sent the ping yet,
    // give it a shot now.
    if (!getBoolean(HasSentOptInPingKey, false)) {
      this.sendOptInStatusPing(this.optOut, storedValue)
    }

    this.enableUiActivityMonitoring()

    window.addEventListener('unhandledrejection', async () => {
      try {
        this.recordUnhandledRejection()
      } catch (err) {
        log.error(`Failed recording unhandled rejection`, err)
      }
    })
  }

  /** Should the app report its daily stats? */
  private shouldReportDailyStats(): boolean {
    const lastDate = getNumber(LastDailyStatsReportKey, 0)
    const now = Date.now()
    return now - lastDate > DailyStatsReportInterval
  }

  /** Report any stats which are eligible for reporting. */
  public async reportStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ) {
    if (this.optOut) {
      return
    }

    // Never report stats while in dev or test. They could be pretty crazy.
    if (__DEV__ || process.env.TEST_ENV) {
      return
    }

    // don't report until the user has had a chance to view and opt-in for
    // sharing their stats with us
    if (!hasShownWelcomeFlow()) {
      return
    }

    if (!this.shouldReportDailyStats()) {
      return
    }

    const now = Date.now()
    const payload = await this.getDailyStats(accounts, repositories)

    try {
      const response = await this.post(payload)
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      log.info('Stats reported.')

      await this.clearDailyStats()
      setNumber(LastDailyStatsReportKey, now)
    } catch (e) {
      log.error('Error reporting stats:', e)
    }
  }

  /** Record the given launch stats. */
  public async recordLaunchStats(stats: ILaunchStats) {
    await this.db.launches.add(stats)
  }

  /**
   * Clear the stored daily stats. Not meant to be called
   * directly. Marked as public in order to enable testing
   * of a specific scenario, see stats-store-tests for more
   * detail.
   */
  public async clearDailyStats() {
    await this.db.launches.clear()
    await this.db.dailyMeasures.clear()

    // This is a one-off, and the moment we have another
    // computed daily measure we should consider refactoring
    // them into their own interface
    localStorage.removeItem(RepositoriesCommittedInWithoutWriteAccessKey)

    this.enableUiActivityMonitoring()
  }

  private enableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription !== null) {
      return
    }

    this.uiActivityMonitorSubscription = this.uiActivityMonitor.onActivity(
      this.onUiActivity
    )
  }

  private disableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription === null) {
      return
    }

    this.uiActivityMonitorSubscription.dispose()
    this.uiActivityMonitorSubscription = null
  }

  /** Get the daily stats. */
  private async getDailyStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    const dailyMeasures = await this.getDailyMeasures()
    const userType = this.determineUserType(accounts)
    const repositoryCounts = this.categorizedRepositoryCounts(repositories)
    const onboardingStats = this.getOnboardingStats()
    const selectedTerminalEmulator =
      localStorage.getItem(terminalEmulatorKey) || 'none'
    const selectedTextEditor = localStorage.getItem(textEditorKey) || 'none'
    const repositoriesCommittedInWithoutWriteAccess = getNumberArray(
      RepositoriesCommittedInWithoutWriteAccessKey
    ).length
    const diffMode = getShowSideBySideDiff() ? 'split' : 'unified'

    // isInApplicationsFolder is undefined when not running on Darwin
    const launchedFromApplicationsFolder =
      remote.app.isInApplicationsFolder?.() ?? null

    return {
      eventType: 'usage',
      version: getVersion(),
      osVersion: getOS(),
      platform: process.platform,
      architecture: getArchitecture(),
      theme: getPersistedThemeName(),
      selectedTerminalEmulator,
      selectedTextEditor,
      ...launchStats,
      ...dailyMeasures,
      ...userType,
      ...onboardingStats,
      guid: getGUID(),
      ...repositoryCounts,
      repositoriesCommittedInWithoutWriteAccess,
      diffMode,
      launchedFromApplicationsFolder,
    }
  }

  private getOnboardingStats(): IOnboardingStats {
    const wizardInitiatedAt = getLocalStorageTimestamp(
      WelcomeWizardInitiatedAtKey
    )

    // If we don't have a start time for the wizard none of our other metrics
    // makes sense. This will happen for users who installed the app before
    // we started tracking onboarding stats.
    if (wizardInitiatedAt === null) {
      return {}
    }

    const timeToWelcomeWizardTerminated = timeTo(WelcomeWizardCompletedAtKey)
    const timeToFirstAddedRepository = timeTo(FirstRepositoryAddedAtKey)
    const timeToFirstClonedRepository = timeTo(FirstRepositoryClonedAtKey)
    const timeToFirstCreatedRepository = timeTo(FirstRepositoryCreatedAtKey)
    const timeToFirstCommit = timeTo(FirstCommitCreatedAtKey)
    const timeToFirstGitHubPush = timeTo(FirstPushToGitHubAtKey)
    const timeToFirstNonDefaultBranchCheckout = timeTo(
      FirstNonDefaultBranchCheckoutAtKey
    )

    const welcomeWizardSignInMethod = getWelcomeWizardSignInMethod()

    return {
      timeToWelcomeWizardTerminated,
      timeToFirstAddedRepository,
      timeToFirstClonedRepository,
      timeToFirstCreatedRepository,
      timeToFirstCommit,
      timeToFirstGitHubPush,
      timeToFirstNonDefaultBranchCheckout,
      welcomeWizardSignInMethod,
    }
  }

  private categorizedRepositoryCounts(repositories: ReadonlyArray<Repository>) {
    return {
      repositoryCount: repositories.length,
      gitHubRepositoryCount: repositories.filter(r => r.gitHubRepository)
        .length,
    }
  }

  /** Determines if an account is a dotCom and/or enterprise user */
  private determineUserType(accounts: ReadonlyArray<Account>) {
    const dotComAccount = !!accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    const enterpriseAccount = !!accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )

    return {
      dotComAccount,
      enterpriseAccount,
    }
  }

  /** Calculate the average launch stats. */
  private async getAverageLaunchStats(): Promise<ILaunchStats> {
    const launches:
      | ReadonlyArray<ILaunchStats>
      | undefined = await this.db.launches.toArray()
    if (!launches || !launches.length) {
      return {
        mainReadyTime: -1,
        loadTime: -1,
        rendererReadyTime: -1,
      }
    }

    const start: ILaunchStats = {
      mainReadyTime: 0,
      loadTime: 0,
      rendererReadyTime: 0,
    }

    const totals = launches.reduce((running, current) => {
      return {
        mainReadyTime: running.mainReadyTime + current.mainReadyTime,
        loadTime: running.loadTime + current.loadTime,
        rendererReadyTime:
          running.rendererReadyTime + current.rendererReadyTime,
      }
    }, start)

    return {
      mainReadyTime: totals.mainReadyTime / launches.length,
      loadTime: totals.loadTime / launches.length,
      rendererReadyTime: totals.rendererReadyTime / launches.length,
    }
  }

  /** Get the daily measures. */
  private async getDailyMeasures(): Promise<IDailyMeasures> {
    const measures:
      | IDailyMeasures
      | undefined = await this.db.dailyMeasures.limit(1).first()
    return {
      ...DefaultDailyMeasures,
      ...measures,
      // We could spread the database ID in, but we really don't want it.
      id: undefined,
    }
  }

  private async updateDailyMeasures<K extends keyof IDailyMeasures>(
    fn: (measures: IDailyMeasures) => Pick<IDailyMeasures, K>
  ): Promise<void> {
    const defaultMeasures = DefaultDailyMeasures
    await this.db.transaction('rw', this.db.dailyMeasures, async () => {
      const measures = await this.db.dailyMeasures.limit(1).first()
      const measuresWithDefaults = {
        ...defaultMeasures,
        ...measures,
      }
      const newMeasures = merge(measuresWithDefaults, fn(measuresWithDefaults))

      return this.db.dailyMeasures.put(newMeasures)
    })
  }

  /** Record that a commit was accomplished. */
  public async recordCommit(): Promise<void> {
    await this.updateDailyMeasures(m => ({
      commits: m.commits + 1,
    }))

    createLocalStorageTimestamp(FirstCommitCreatedAtKey)
  }

  /** Record that a partial commit was accomplished. */
  public recordPartialCommit(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      partialCommits: m.partialCommits + 1,
    }))
  }

  /** Record that a commit was created with one or more co-authors. */
  public recordCoAuthoredCommit(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      coAuthoredCommits: m.coAuthoredCommits + 1,
    }))
  }

  /** Record that the user opened a shell. */
  public recordOpenShell(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      openShellCount: m.openShellCount + 1,
    }))
  }

  /** Record that a branch comparison has been made */
  public recordBranchComparison(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      branchComparisons: m.branchComparisons + 1,
    }))
  }

  /** Record that a branch comparison has been made to the default branch */
  public recordDefaultBranchComparison(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      defaultBranchComparisons: m.defaultBranchComparisons + 1,
    }))
  }

  /** Record that a merge has been initiated from the `compare` sidebar */
  public recordCompareInitiatedMerge(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergesInitiatedFromComparison: m.mergesInitiatedFromComparison + 1,
    }))
  }

  /** Record that a merge has been initiated from the `Branch -> Update From Default Branch` menu item */
  public recordMenuInitiatedUpdate(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      updateFromDefaultBranchMenuCount: m.updateFromDefaultBranchMenuCount + 1,
    }))
  }

  /** Record that conflicts were detected by a merge initiated by Desktop */
  public recordMergeConflictFromPull(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeConflictFromPullCount: m.mergeConflictFromPullCount + 1,
    }))
  }

  /** Record that conflicts were detected by a merge initiated by Desktop */
  public recordMergeConflictFromExplicitMerge(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeConflictFromExplicitMergeCount:
        m.mergeConflictFromExplicitMergeCount + 1,
    }))
  }

  /** Record that a merge has been initiated from the `Branch -> Merge Into Current Branch` menu item */
  public recordMenuInitiatedMerge(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeIntoCurrentBranchMenuCount: m.mergeIntoCurrentBranchMenuCount + 1,
    }))
  }

  public recordMenuInitiatedRebase(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseCurrentBranchMenuCount: m.rebaseCurrentBranchMenuCount + 1,
    }))
  }

  /** Record that the user checked out a PR branch */
  public recordPRBranchCheckout(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      prBranchCheckouts: m.prBranchCheckouts + 1,
    }))
  }

  public recordRepoClicked(repoHasIndicator: boolean): Promise<void> {
    if (repoHasIndicator) {
      return this.updateDailyMeasures(m => ({
        repoWithIndicatorClicked: m.repoWithIndicatorClicked + 1,
      }))
    }
    return this.updateDailyMeasures(m => ({
      repoWithoutIndicatorClicked: m.repoWithoutIndicatorClicked + 1,
    }))
  }

  /**
   * Records that the user made a commit using an email address that
   * was not associated with the user's account on GitHub.com or GitHub
   * Enterprise, meaning that the commit will not be attributed to the
   * user's account.
   */
  public recordUnattributedCommit(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      unattributedCommits: m.unattributedCommits + 1,
    }))
  }

  /**
   * Records that the user made a commit to a repository hosted on
   * a GitHub Enterprise instance
   */
  public recordCommitToEnterprise(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      enterpriseCommits: m.enterpriseCommits + 1,
    }))
  }

  /** Records that the user made a commit to a repository hosted on GitHub.com */
  public recordCommitToDotcom(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      dotcomCommits: m.dotcomCommits + 1,
    }))
  }

  /** Record the user made a commit to a protected GitHub or GitHub Enterprise repository */
  public recordCommitToProtectedBranch(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      commitsToProtectedBranch: m.commitsToProtectedBranch + 1,
    }))
  }

  /** Record the user made a commit to repository which has branch protections enabled */
  public recordCommitToRepositoryWithBranchProtections(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      commitsToRepositoryWithBranchProtections:
        m.commitsToRepositoryWithBranchProtections + 1,
    }))
  }

  /** Set whether the user has opted out of stats reporting. */
  public async setOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    const changed = this.optOut !== optOut

    this.optOut = optOut

    const previousValue = getBoolean(StatsOptOutKey)

    setBoolean(StatsOptOutKey, optOut)

    if (changed || userViewedPrompt) {
      await this.sendOptInStatusPing(optOut, previousValue)
    }
  }

  /** Has the user opted out of stats reporting? */
  public getOptOut(): boolean {
    return this.optOut
  }

  public async recordPush(
    githubAccount: Account | null,
    options?: PushOptions
  ) {
    if (githubAccount === null) {
      await this.recordPushToGenericRemote(options)
    } else if (githubAccount.endpoint === getDotComAPIEndpoint()) {
      await this.recordPushToGitHub(options)
    } else {
      await this.recordPushToGitHubEnterprise(options)
    }
  }

  /** Record that the user pushed to GitHub.com */
  private async recordPushToGitHub(options?: PushOptions): Promise<void> {
    if (options && options.forceWithLease) {
      await this.updateDailyMeasures(m => ({
        dotcomForcePushCount: m.dotcomForcePushCount + 1,
      }))
    }

    await this.updateDailyMeasures(m => ({
      dotcomPushCount: m.dotcomPushCount + 1,
    }))

    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a GitHub Enterprise instance */
  private async recordPushToGitHubEnterprise(
    options?: PushOptions
  ): Promise<void> {
    if (options && options.forceWithLease) {
      await this.updateDailyMeasures(m => ({
        enterpriseForcePushCount: m.enterpriseForcePushCount + 1,
      }))
    }

    await this.updateDailyMeasures(m => ({
      enterprisePushCount: m.enterprisePushCount + 1,
    }))

    // Note, this is not a typo. We track both GitHub.com and
    // GitHub Enterprise under the same key
    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a generic remote */
  private async recordPushToGenericRemote(
    options?: PushOptions
  ): Promise<void> {
    if (options && options.forceWithLease) {
      await this.updateDailyMeasures(m => ({
        externalForcePushCount: m.externalForcePushCount + 1,
      }))
    }

    await this.updateDailyMeasures(m => ({
      externalPushCount: m.externalPushCount + 1,
    }))
  }

  /** Record that the user saw a 'merge conflicts' warning but continued with the merge */
  public recordUserProceededWhileLoading(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergedWithLoadingHintCount: m.mergedWithLoadingHintCount + 1,
    }))
  }

  /** Record that the user saw a 'merge conflicts' warning but continued with the merge */
  public recordMergeHintSuccessAndUserProceeded(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergedWithCleanMergeHintCount: m.mergedWithCleanMergeHintCount + 1,
    }))
  }

  /** Record that the user saw a 'merge conflicts' warning but continued with the merge */
  public recordUserProceededAfterConflictWarning(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergedWithConflictWarningHintCount:
        m.mergedWithConflictWarningHintCount + 1,
    }))
  }

  /**
   * Increments the `mergeConflictsDialogDismissalCount` metric
   */
  public recordMergeConflictsDialogDismissal(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeConflictsDialogDismissalCount:
        m.mergeConflictsDialogDismissalCount + 1,
    }))
  }

  /**
   * Increments the `anyConflictsLeftOnMergeConflictsDialogDismissalCount` metric
   */
  public recordAnyConflictsLeftOnMergeConflictsDialogDismissal(): Promise<
    void
  > {
    return this.updateDailyMeasures(m => ({
      anyConflictsLeftOnMergeConflictsDialogDismissalCount:
        m.anyConflictsLeftOnMergeConflictsDialogDismissalCount + 1,
    }))
  }

  /**
   * Increments the `mergeConflictsDialogReopenedCount` metric
   */
  public recordMergeConflictsDialogReopened(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeConflictsDialogReopenedCount:
        m.mergeConflictsDialogReopenedCount + 1,
    }))
  }

  /**
   * Increments the `guidedConflictedMergeCompletionCount` metric
   */
  public recordGuidedConflictedMergeCompletion(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      guidedConflictedMergeCompletionCount:
        m.guidedConflictedMergeCompletionCount + 1,
    }))
  }

  /**
   * Increments the `unguidedConflictedMergeCompletionCount` metric
   */
  public recordUnguidedConflictedMergeCompletion(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      unguidedConflictedMergeCompletionCount:
        m.unguidedConflictedMergeCompletionCount + 1,
    }))
  }

  /**
   * Increments the `createPullRequestCount` metric
   */
  public recordCreatePullRequest(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      createPullRequestCount: m.createPullRequestCount + 1,
    }))
  }

  /**
   * Increments the `rebaseConflictsDialogDismissalCount` metric
   */
  public recordRebaseConflictsDialogDismissal(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseConflictsDialogDismissalCount:
        m.rebaseConflictsDialogDismissalCount + 1,
    }))
  }

  /**
   * Increments the `rebaseConflictsDialogReopenedCount` metric
   */
  public recordRebaseConflictsDialogReopened(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseConflictsDialogReopenedCount:
        m.rebaseConflictsDialogReopenedCount + 1,
    }))
  }

  /**
   * Increments the `rebaseAbortedAfterConflictsCount` metric
   */
  public recordRebaseAbortedAfterConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseAbortedAfterConflictsCount: m.rebaseAbortedAfterConflictsCount + 1,
    }))
  }
  /**
   * Increments the `pullWithRebaseCount` metric
   */
  public recordPullWithRebaseEnabled() {
    return this.updateDailyMeasures(m => ({
      pullWithRebaseCount: m.pullWithRebaseCount + 1,
    }))
  }

  /**
   * Increments the `rebaseSuccessWithoutConflictsCount` metric
   */
  public recordRebaseSuccessWithoutConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseSuccessWithoutConflictsCount:
        m.rebaseSuccessWithoutConflictsCount + 1,
    }))
  }

  /**
   * Increments the `rebaseSuccessAfterConflictsCount` metric
   */
  public recordRebaseSuccessAfterConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      rebaseSuccessAfterConflictsCount: m.rebaseSuccessAfterConflictsCount + 1,
    }))
  }

  /**
   * Increments the `pullWithDefaultSettingCount` metric
   */
  public recordPullWithDefaultSetting() {
    return this.updateDailyMeasures(m => ({
      pullWithDefaultSettingCount: m.pullWithDefaultSettingCount + 1,
    }))
  }

  public recordWelcomeWizardInitiated() {
    setNumber(WelcomeWizardInitiatedAtKey, Date.now())
    localStorage.removeItem(WelcomeWizardCompletedAtKey)
  }

  public recordWelcomeWizardTerminated() {
    setNumber(WelcomeWizardCompletedAtKey, Date.now())
  }

  public recordAddExistingRepository() {
    createLocalStorageTimestamp(FirstRepositoryAddedAtKey)
  }

  public recordCloneRepository() {
    createLocalStorageTimestamp(FirstRepositoryClonedAtKey)
  }

  public recordCreateRepository() {
    createLocalStorageTimestamp(FirstRepositoryCreatedAtKey)
  }

  public recordNonDefaultBranchCheckout() {
    createLocalStorageTimestamp(FirstNonDefaultBranchCheckoutAtKey)
  }

  public recordWelcomeWizardSignInMethod(method: SignInMethod) {
    localStorage.setItem(WelcomeWizardSignInMethodKey, method)
  }

  /** Record when a conflicted merge was successfully completed by the user */
  public recordMergeSuccessAfterConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeSuccessAfterConflictsCount: m.mergeSuccessAfterConflictsCount + 1,
    }))
  }

  /** Record when a conflicted merge was aborted by the user */
  public recordMergeAbortedAfterConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      mergeAbortedAfterConflictsCount: m.mergeAbortedAfterConflictsCount + 1,
    }))
  }

  /** Record when the user views a stash entry after checking out a branch */
  public recordStashViewedAfterCheckout(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashViewedAfterCheckoutCount: m.stashViewedAfterCheckoutCount + 1,
    }))
  }

  /** Record when the user **doesn't** view a stash entry after checking out a branch */
  public recordStashNotViewedAfterCheckout(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashNotViewedAfterCheckoutCount: m.stashNotViewedAfterCheckoutCount + 1,
    }))
  }

  /** Record when the user elects to take changes to new branch over stashing */
  public recordChangesTakenToNewBranch(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      changesTakenToNewBranchCount: m.changesTakenToNewBranchCount + 1,
    }))
  }

  /** Record when the user elects to stash changes on the current branch */
  public recordStashCreatedOnCurrentBranch(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashCreatedOnCurrentBranchCount: m.stashCreatedOnCurrentBranchCount + 1,
    }))
  }

  /** Record when the user discards a stash entry */
  public recordStashDiscard(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashDiscardCount: m.stashDiscardCount + 1,
    }))
  }

  /** Record when the user views a stash entry */
  public recordStashView(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashViewCount: m.stashViewCount + 1,
    }))
  }

  /** Record when the user restores a stash entry */
  public recordStashRestore(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashRestoreCount: m.stashRestoreCount + 1,
    }))
  }

  /** Record when the user takes no action on the stash entry */
  public recordNoActionTakenOnStash(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      noActionTakenOnStashCount: m.noActionTakenOnStashCount + 1,
    }))
  }

  /** Record the number of stash entries created outside of Desktop for the day */
  public addStashEntriesCreatedOutsideDesktop(
    stashCount: number
  ): Promise<void> {
    return this.updateDailyMeasures(m => ({
      stashEntriesCreatedOutsideDesktop:
        m.stashEntriesCreatedOutsideDesktop + stashCount,
    }))
  }

  /**
   * Record the number of times the user experiences the error
   * "Some of your changes would be overwritten" when switching branches
   */
  public recordErrorWhenSwitchingBranchesWithUncommmittedChanges(): Promise<
    void
  > {
    return this.updateDailyMeasures(m => ({
      errorWhenSwitchingBranchesWithUncommmittedChanges:
        m.errorWhenSwitchingBranchesWithUncommmittedChanges + 1,
    }))
  }

  /**
   * Increment the number of times the user has opened their external editor
   * from the suggested next steps view
   */
  public recordSuggestedStepOpenInExternalEditor(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepOpenInExternalEditor:
        m.suggestedStepOpenInExternalEditor + 1,
    }))
  }

  /**
   * Increment the number of times the user has opened their repository in
   * Finder/Explorer from the suggested next steps view
   */
  public recordSuggestedStepOpenWorkingDirectory(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepOpenWorkingDirectory:
        m.suggestedStepOpenWorkingDirectory + 1,
    }))
  }

  /**
   * Increment the number of times the user has opened their repository on
   * GitHub from the suggested next steps view
   */
  public recordSuggestedStepViewOnGitHub(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepViewOnGitHub: m.suggestedStepViewOnGitHub + 1,
    }))
  }

  /**
   * Increment the number of times the user has used the publish repository
   * action from the suggested next steps view
   */
  public recordSuggestedStepPublishRepository(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepPublishRepository: m.suggestedStepPublishRepository + 1,
    }))
  }

  /**
   * Increment the number of times the user has used the publish branch
   * action branch from the suggested next steps view
   */
  public recordSuggestedStepPublishBranch(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepPublishBranch: m.suggestedStepPublishBranch + 1,
    }))
  }

  /**
   * Increment the number of times the user has used the Create PR suggestion
   * in the suggested next steps view.
   */
  public recordSuggestedStepCreatePullRequest(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepCreatePullRequest: m.suggestedStepCreatePullRequest + 1,
    }))
  }

  /**
   * Increment the number of times the user has used the View Stash suggestion
   * in the suggested next steps view.
   */
  public recordSuggestedStepViewStash(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      suggestedStepViewStash: m.suggestedStepViewStash + 1,
    }))
  }

  private onUiActivity = async () => {
    this.disableUiActivityMonitoring()

    return this.updateDailyMeasures(m => ({
      active: true,
    }))
  }

  /*
   * Onboarding tutorial metrics
   */

  /**
   * Onboarding tutorial has been started, the user has
   * clicked the button to start the onboarding tutorial.
   */
  public recordTutorialStarted() {
    return this.updateDailyMeasures(() => ({
      tutorialStarted: true,
    }))
  }

  /**
   * Onboarding tutorial has been successfully created
   */
  public recordTutorialRepoCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialRepoCreated: true,
    }))
  }

  public recordTutorialEditorInstalled() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
    }))
  }

  public recordTutorialBranchCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
    }))
  }

  public recordTutorialFileEdited() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
    }))
  }

  public recordTutorialCommitCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
    }))
  }

  public recordTutorialBranchPushed() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
    }))
  }

  public recordTutorialPrCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
      tutorialPrCreated: true,
    }))
  }

  public recordTutorialCompleted() {
    return this.updateDailyMeasures(() => ({
      tutorialCompleted: true,
    }))
  }

  public recordHighestTutorialStepCompleted(step: number) {
    return this.updateDailyMeasures(m => ({
      highestTutorialStepCompleted: Math.max(
        step,
        m.highestTutorialStepCompleted
      ),
    }))
  }

  public recordCommitToRepositoryWithoutWriteAccess() {
    return this.updateDailyMeasures(m => ({
      commitsToRepositoryWithoutWriteAccess:
        m.commitsToRepositoryWithoutWriteAccess + 1,
    }))
  }

  /**
   * Record that the user made a commit in a repository they don't
   * have `write` access to. Dedupes based on the database ID provided
   *
   * @param gitHubRepositoryDbId database ID for the GitHubRepository of
   *                             the local repo this commit was made in
   */
  public recordRepositoryCommitedInWithoutWriteAccess(
    gitHubRepositoryDbId: number
  ) {
    const ids = getNumberArray(RepositoriesCommittedInWithoutWriteAccessKey)
    if (!ids.includes(gitHubRepositoryDbId)) {
      setNumberArray(RepositoriesCommittedInWithoutWriteAccessKey, [
        ...ids,
        gitHubRepositoryDbId,
      ])
    }
  }

  public recordForkCreated() {
    return this.updateDailyMeasures(m => ({
      forksCreated: m.forksCreated + 1,
    }))
  }

  public recordIssueCreationWebpageOpened() {
    return this.updateDailyMeasures(m => ({
      issueCreationWebpageOpenedCount: m.issueCreationWebpageOpenedCount + 1,
    }))
  }

  public recordTagCreatedInDesktop() {
    return this.updateDailyMeasures(m => ({
      tagsCreatedInDesktop: m.tagsCreatedInDesktop + 1,
    }))
  }

  public recordTagCreated(numCreatedTags: number) {
    return this.updateDailyMeasures(m => ({
      tagsCreated: m.tagsCreated + numCreatedTags,
    }))
  }

  public recordTagDeleted() {
    return this.updateDailyMeasures(m => ({
      tagsDeleted: m.tagsDeleted + 1,
    }))
  }

  public recordDiffOptionsViewed() {
    return this.updateDailyMeasures(m => ({
      diffOptionsViewedCount: m.diffOptionsViewedCount + 1,
    }))
  }

  public recordRepositoryViewChanged() {
    return this.updateDailyMeasures(m => ({
      repositoryViewChangeCount: m.repositoryViewChangeCount + 1,
    }))
  }

  public recordDiffModeChanged() {
    return this.updateDailyMeasures(m => ({
      diffModeChangeCount: m.diffModeChangeCount + 1,
    }))
  }

  public recordUnhandledRejection() {
    return this.updateDailyMeasures(m => ({
      unhandledRejectionCount: m.unhandledRejectionCount + 1,
    }))
  }

  public recordCherryPickSuccessful(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickSuccessfulCount: m.cherryPickSuccessfulCount + 1,
    }))
  }

  public recordCherryPickViaDragAndDrop(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickViaDragAndDropCount: m.cherryPickViaDragAndDropCount + 1,
    }))
  }

  public recordCherryPickViaContextMenu(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickViaContextMenuCount: m.cherryPickViaContextMenuCount + 1,
    }))
  }

  public recordCherryPickDragStartedAndCanceled(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickDragStartedAndCanceledCount:
        m.cherryPickDragStartedAndCanceledCount + 1,
    }))
  }

  public recordCherryPickConflictsEncountered(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickConflictsEncounteredCount:
        m.cherryPickConflictsEncounteredCount + 1,
    }))
  }

  public recordCherryPickSuccessfulWithConflicts(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickSuccessfulWithConflictsCount:
        m.cherryPickSuccessfulWithConflictsCount + 1,
    }))
  }

  public recordCherryPickMultipleCommits(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickMultipleCommitsCount: m.cherryPickMultipleCommitsCount + 1,
    }))
  }

  public recordCherryPickUndone(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickUndoneCount: m.cherryPickUndoneCount + 1,
    }))
  }

  public recordCherryPickBranchCreatedCount(): Promise<void> {
    return this.updateDailyMeasures(m => ({
      cherryPickBranchCreatedCount: m.cherryPickBranchCreatedCount + 1,
    }))
  }

  /** Post some data to our stats endpoint. */
  private post(body: object): Promise<Response> {
    const options: RequestInit = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }

    return fetch(StatsEndpoint, options)
  }

  /**
   * Send opt-in ping with details of previous stored value (if known)
   *
   * @param optOut        Whether or not the user has opted
   *                      out of usage reporting.
   * @param previousValue The raw, current value stored for the
   *                      "stats-opt-out" localStorage key, or
   *                      undefined if no previously stored value
   *                      exists.
   */
  private async sendOptInStatusPing(
    optOut: boolean,
    previousValue: boolean | undefined
  ): Promise<void> {
    // The analytics pipeline expects us to submit `optIn` but we
    // track `optOut` so we need to invert the value before we send
    // it.
    const optIn = !optOut
    const previousOptInValue =
      previousValue === undefined ? null : !previousValue
    const direction = optIn ? 'in' : 'out'

    try {
      const response = await this.post({
        eventType: 'ping',
        optIn,
        previousOptInValue,
      })
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      setBoolean(HasSentOptInPingKey, true)

      log.info(`Opt ${direction} reported.`)
    } catch (e) {
      log.error(`Error reporting opt ${direction}:`, e)
    }
  }
}

/**
 * Store the current date (in unix time) in localStorage.
 *
 * If the provided key already exists it will not be
 * overwritten.
 */
function createLocalStorageTimestamp(key: string) {
  if (localStorage.getItem(key) === null) {
    setNumber(key, Date.now())
  }
}

/**
 * Get a time stamp (in unix time) from localStorage.
 *
 * If the key doesn't exist or if the stored value can't
 * be converted into a number this method will return null.
 */
function getLocalStorageTimestamp(key: string): number | null {
  const timestamp = getNumber(key)
  return timestamp === undefined ? null : timestamp
}

/**
 * Calculate the duration (in seconds) between the time the
 * welcome wizard was initiated to the time for the given
 * action.
 *
 * If no time stamp exists for when the welcome wizard was
 * initiated, which would be the case if the user completed
 * the wizard before we introduced onboarding metrics, or if
 * the delta between the two values are negative (which could
 * happen if a user manually manipulated localStorage in order
 * to run the wizard again) this method will return undefined.
 */
function timeTo(key: string): number | undefined {
  const startTime = getLocalStorageTimestamp(WelcomeWizardInitiatedAtKey)

  if (startTime === null) {
    return undefined
  }

  const endTime = getLocalStorageTimestamp(key)
  return endTime === null || endTime <= startTime
    ? -1
    : Math.round((endTime - startTime) / 1000)
}

/**
 * Get a string representing the sign in method that was used
 * when authenticating a user in the welcome flow. This method
 * ensures that the reported value is known to the analytics
 * system regardless of whether the enum value of the SignInMethod
 * type changes.
 */
function getWelcomeWizardSignInMethod(): 'basic' | 'web' | undefined {
  const method = localStorage.getItem(
    WelcomeWizardSignInMethodKey
  ) as SignInMethod | null

  try {
    switch (method) {
      case SignInMethod.Basic:
      case SignInMethod.Web:
        return method
      case null:
        return undefined
      default:
        return assertNever(method, `Unknown sign in method: ${method}`)
    }
  } catch (ex) {
    log.error(`Could not parse welcome wizard sign in method`, ex)
    return undefined
  }
}

/**
 * Return a value indicating whether the user has opted out of stats reporting
 * or not.
 */
export function getHasOptedOutOfStats() {
  return getBoolean(StatsOptOutKey)
}
