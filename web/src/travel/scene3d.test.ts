import { describe, expect, it } from 'vitest';

import beograd from '../../public/travel/scenes/beograd.json';
import noviSad from '../../public/travel/scenes/novi-sad.json';
import { STREET_OBJECTS, supportsTravel3D, type TravelSceneData } from './scene3d';

const scenes = [beograd, noviSad] as TravelSceneData[];

describe('3D-карта Путешествия', () => {
  it('доступна только для подготовленных городов', () => {
    expect(supportsTravel3D('beograd')).toBe(true);
    expect(supportsTravel3D('novi-sad')).toBe(true);
    expect(supportsTravel3D('nis')).toBe(false);
  });

  for (const scene of scenes) {
    it(`${scene.cityId}: содержит город и учебные предметы`, () => {
      expect(scene.source).toEqual({ name: 'OpenStreetMap contributors', license: 'ODbL-1.0' });
      expect(scene.buildings.length).toBeGreaterThanOrEqual(80);
      expect(scene.roads.length).toBeGreaterThanOrEqual(50);
      expect(scene.objects.length).toBeGreaterThanOrEqual(80);
      expect(new Set(scene.objects.map((item) => item.kind))).toContain('tree');
      expect(new Set(scene.objects.map((item) => item.kind))).toContain('bench');
      for (const item of scene.objects) expect(STREET_OBJECTS[item.kind]).toBeDefined();
    });
  }
});
