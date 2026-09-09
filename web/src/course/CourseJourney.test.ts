import { describe, expect, it } from 'vitest';
import { courseDone, journeyLayout } from './CourseJourney';
import type { CourseBundle } from './types';
describe('course journey',()=>{
  it('reserves caption and skill space without moving lessons out of order',()=>{
    const unit={skills:[{title:'Азбука',lessons:[{id:'one'},{id:'two'}]},{title:'Фразы',lessons:[{id:'three'}]}]} as unknown as CourseBundle['units'][number];
    const layout=journeyLayout(unit);
    expect(layout.nodes.map(n=>n.lesson.id)).toEqual(['one','two','three']);
    expect(layout.nodes[1]!.y-layout.nodes[0]!.y).toBeGreaterThanOrEqual(230);
    expect(layout.nodes[2]!.y-layout.nodes[1]!.y).toBeGreaterThan(230);
    expect(layout.labels).toHaveLength(2);
    expect(layout.height).toBeGreaterThan(layout.nodes[2]!.y+200);
    expect(layout.nodes.every(n=>n.x>=.25&&n.x<=.7)).toBe(true);
  });
  it('does not count placement or an available lesson as completed',()=>{
    expect(courseDone('available')).toBe(false);expect(courseDone('locked')).toBe(false);
    expect(courseDone('needsReview')).toBe(true);expect(courseDone('completed')).toBe(true);
  });
});
