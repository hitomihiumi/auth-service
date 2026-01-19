import { IconType } from "react-icons";

import {
  HiOutlineRocketLaunch,
} from "react-icons/hi2";
import { FaDiscord, FaGoogle } from "react-icons/fa";


export const iconLibrary: Record<string, IconType> = {
  rocket: HiOutlineRocketLaunch,
  google: FaGoogle,
  discord: FaDiscord
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;