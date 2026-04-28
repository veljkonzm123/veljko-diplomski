import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const GRID_COLUMNS = 3;
export const GRID_SPACING = 4;
export const THUMB_SIZE =
  (SCREEN_WIDTH - 40 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
