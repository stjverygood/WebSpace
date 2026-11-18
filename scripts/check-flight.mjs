import assert from 'node:assert/strict';
import { Flight } from '../src/flight.ts';
import { planets, surfaceRadius } from '../src/world.ts';
const step = (f, seconds) => { for (let i = 0; i < seconds * 120; i++) f.update(1 / 120); };
for (const planet of planets) {
  const f = new Flight();
  f.navigate(planet); step(f, 45);
  assert.equal(f.mode, 'manual', `navigation completes: ${planet.name}`);
  assert.ok(f.speed < 1, 'navigation stops safely');
  assert.ok(f.local.altitude > 25 && f.local.altitude < 45, 'navigation reaches low altitude');
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
manual.keys.clear(); manual.keys.add('Space'); step(manual, 3);
assert.ok(manual.speed < .1, 'brake cancels inertia');
manual.navigate(planets[0]);manual.keys.add('KeyA');manual.update(.01);
assert.equal(manual.mode, 'manual', 'manual input cancels navigation');
console.log('PASS: navigation, terrain clearance, landing and takeoff on all 3 planets; collision, thrust, braking, navigation cancellation.');

