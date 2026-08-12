import { request } from './client';

export interface GardenSpecies {
  id: string;
  serbian: string;
  russian: string;
  price: number;
  topic: string;
  theme: string;
  phrase: string;
}

export interface GardenPlant {
  slot: number;
  species: string;
  stage: number;
  growth: number;
  blooming: boolean;
  speed: number;
  plantedAt: string;
  wateredAt?: string;
}

export interface GardenDecoration {
  id: string;
  serbian: string;
  russian: string;
  price: number;
  /** Где предмет появится: во дворе или в комнате. */
  place: 'garden' | 'house';
}

export interface GardenEarning {
  source: string;
  title: string;
  today: number;
  cap: number;
}

export interface GardenHerbariumItem {
  species: string;
  count: number;
  firstAt: string;
}

export interface GardenTask {
  kind: string;
  target: number;
  progress: number;
  reward: number;
  done: boolean;
}

export interface GardenCut {
  species: string;
  coins: number;
  first: boolean;
}

export interface GardenState {
  nickname: string;
  public: boolean;
  coins: number;
  earnedTotal: number;
  slots: number;
  plants: GardenPlant[];
  decorations: string[];
  bloomed: number;
  earnings: GardenEarning[];
  todayCoins: number;
  speed: number;
  helpedToday: number;
  helpLimit: number;
  catalog: GardenSpecies[];
  decorationCatalog: GardenDecoration[];
  stages: number;

  /** Поливов в лейке и сколько раз сегодня уже набирали из реки. */
  water: number;
  waterCap: number;
  filledToday: number;
  fillLimit: number;
  /** Река течёт в тот день, когда были занятия. */
  river: boolean;
  weather: 'clear' | 'rain';
  herbarium: GardenHerbariumItem[];
  task?: GardenTask;
  /** Приходит только в ответе на срез: за что заплатили и первый ли это цветок. */
  cut?: GardenCut;
}

export interface GardenBoardRow {
  nickname: string;
  bloomed: number;
  plants: number;
  species: number;
  growing?: string[];
}

export interface PublicGarden {
  nickname: string;
  slots: number;
  plants: GardenPlant[];
  decorations: string[];
  bloomed: number;
  canWater: boolean;
}

export function loadGarden(): Promise<GardenState> {
  return request<GardenState>('/v1/garden');
}

export function plantSeed(slot: number, species: string): Promise<GardenState> {
  return request<GardenState>('/v1/garden/plant', {
    method: 'POST',
    body: { slot, species },
  });
}

export function waterPlant(slot: number): Promise<GardenState> {
  return request<GardenState>('/v1/garden/water', {
    method: 'POST',
    body: { slot },
  });
}

export function fillGardenCan(): Promise<GardenState> {
  return request<GardenState>('/v1/garden/fill', { method: 'POST' });
}

export function cutGardenFlower(slot: number): Promise<GardenState> {
  return request<GardenState>('/v1/garden/cut', {
    method: 'POST',
    body: { slot },
  });
}

export function buyGardenDecoration(decoration: string): Promise<GardenState> {
  return request<GardenState>('/v1/garden/decorations/buy', {
    method: 'POST',
    body: { decoration },
  });
}

export function saveGardenProfile(
  nickname: string,
  isPublic: boolean,
): Promise<GardenState> {
  return request<GardenState>('/v1/garden/profile', {
    method: 'PUT',
    body: { nickname, public: isPublic },
  });
}

export function loadLeaderboard(): Promise<{ board: GardenBoardRow[] }> {
  return request<{ board: GardenBoardRow[] }>('/v1/garden/leaderboard');
}

export function searchGardeners(
  query: string,
  species = '',
): Promise<{ gardeners: GardenBoardRow[]; catalog: GardenSpecies[] }> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (species) params.set('species', species);
  const tail = params.toString();
  return request(`/v1/garden/search${tail ? `?${tail}` : ''}`);
}

export function loadPublicGarden(nickname: string): Promise<{
  garden: PublicGarden;
  catalog: GardenSpecies[];
  decorationCatalog: GardenDecoration[];
  stages: number;
}> {
  return request(`/v1/garden/${encodeURIComponent(nickname)}`);
}

export function helpGarden(nickname: string): Promise<{ reward: number }> {
  return request(`/v1/garden/${encodeURIComponent(nickname)}/water`, {
    method: 'POST',
  });
}
