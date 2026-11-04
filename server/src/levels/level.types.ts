export interface LevelObject {
  type: 'button' | 'lever' | 'gate' | 'lift' | 'platform' | 'box' | 'checkpoint' | 'boss' | 'finish';
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  tx?: number;
  ty?: number;
  speed?: number;
  trigger?: string[];
  [extra: string]: unknown;
}

export interface LevelDefinition {
  id: number;
  name: string;
  hint: string;
  par: number;
  width: number;
  height: number;
  map: string[];
  objects: LevelObject[];
  mode?: 'campaign' | 'race';
}

export interface LevelSummary {
  mode: 'campaign' | 'race';
  id: number;
  name: string;
  hint: string;
  par: number;
  gems: number;
}
