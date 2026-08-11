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
}

export interface GardenEarning {
  source: string;
  title: string;
  today: number;
  cap: number;
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
