import assert from 'node:assert/strict';
import { Flight } from '../src/flight.ts';
import { planets, surfaceRadius } from '../src/world.ts';
const step = (f, seconds) => { for (let i = 0; i < seconds * 120; i++) f.update(1 / 120); };
for (const planet of planets) {
  const f = new Flight();
  const normal = f.position.clone().sub(planet.center).normalize();
  f.position.copy(planet.center).addScaledVector(normal, surfaceRadius(planet, normal) + 38);
  assert.equal(f.mode, 'manual', `flight remains under player control near ${planet.name}`);
  assert.ok(f.speed < 1, 'craft starts at rest');
  f.interact(); assert.equal(f.mode, 'landing'); step(f, 25);
  assert.equal(f.mode, 'landed', `landing completes: ${planet.name}`);
  assert.ok(Math.abs(f.local.altitude - 2.8) < 0.01, 'craft rests above surface');
  f.interact(); step(f, 4);
  assert.equal(f.mode, 'manual', 'takeoff returns manual control');
  assert.ok(f.local.altitude > 30, 'takeoff gains altitude');
}
const collision = new Flight();
const body = planets[0];
const normal = collision.position.clone().sub(body.center).normalize();
collision.position.copy(body.center).addScaledVector(normal, surfaceRadius(body, normal) + 3);
collision.velocity.copy(normal).multiplyScalar(-260);
step(collision, 1);
assert.ok(collision.local.altitude >= 2.799, 'high speed terrain collision prevents penetration');
const manual = new Flight(); manual.keys.add('KeyW'); step(manual, 3);
assert.ok(manual.speed > 40, 'thrust accelerates craft');
manual.keys.clear(); manual.keys.add('KeyS'); step(manual, 3.5);
assert.ok(manual.speed < 35, 'reverse thrust slows forward motion');
console.log('PASS: manual flight, terrain clearance, landing and takeoff on all 3 planets; collision, thrust and reverse deceleration.');

