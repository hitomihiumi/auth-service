import { IconType } from "react-icons";

import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
import { HiOutlineKey, HiOutlineRocketLaunch } from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  rocket: HiOutlineRocketLaunch,
  google: FaGoogle,
  discord: FaDiscord,
  github: FaGithub,
  // Fallback for generic OIDC/OAuth2 providers, which have no brand icon.
  key: HiOutlineKey,
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;
