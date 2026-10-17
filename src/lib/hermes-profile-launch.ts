export type HermesLaunchSpec = {
  cmd: "hermes"
  args: string[]
  env: { HERMES_HOME?: string }
}

const PROFILE_ID = /^[a-z0-9][a-z0-9-]*$/

/** Built-in Hermes Agent: default home, no `-p`. */
export function hermesDispatcherLaunch(_hermesRoot: string): HermesLaunchSpec {
  return { cmd: "hermes", args: ["acp"], env: {} }
}

/**
 * One named profile = one ACP process.
 *
 * `HERMES_HOME` must already be the profile directory. Do not also pass `-p`:
 * Hermes resolves `-p` as `$HERMES_HOME/profiles/<id>` and would nest.
 */
export function hermesProfileLaunch(
  profileId: string,
  hermesRoot: string
): HermesLaunchSpec {
  if (!PROFILE_ID.test(profileId)) {
    throw new Error(`invalid Hermes profile id: ${profileId}`)
  }
  const root = hermesRoot.replace(/\/$/, "")
  return {
    cmd: "hermes",
    args: ["acp"],
    env: { HERMES_HOME: `${root}/profiles/${profileId}` },
  }
}
