export interface MobileActions {
  enabled: () => boolean;
  onFoot: () => boolean;
  inVehicle: () => boolean;
  look: (x: number, y: number) => void;
  zoom: (distanceDelta: number) => void;
  interact: () => void;
  takeoff: () => void;
  jump: () => void;
  useWeapon: () => void;
}

/** Each finger owns its input until pointerup/cancel; releasing one never cancels another. */
export class MobileControls {
  private sources = new Map<number, Set<string>>();
  private joystickPointer: number | null = null;
  private steeringX = 0;
  private steeringY = 0;
  private stickOrigin = { x: 0, y: 0 };
  private lookPointers = new Map<number, { x: number; y: number }>();
  private pinchDistance: number | null = null;
  private cleanup = new Set<() => void>();
  private stick = document.getElementById("joystick")!;
  private stickArea = document.getElementById("joystick-area")!;
  private thumb = document.getElementById("joystick-thumb")!;
  private actions: MobileActions;
  constructor(actions: MobileActions) {
    this.actions = actions;
    const beginStick = (e: PointerEvent, floating: boolean) => {
      if (!actions.enabled() || this.joystickPointer !== null) return;
      e.preventDefault();
      this.joystickPointer = e.pointerId;
      if (floating) {
        const area = this.stickArea.getBoundingClientRect();
        const radius = this.stick.getBoundingClientRect().width / 2;
        const left = Math.max(radius, Math.min(area.width - radius, e.clientX - area.left));
        const top = Math.max(radius, Math.min(area.height - radius, e.clientY - area.top));
        this.stick.style.left = `${left}px`;
        this.stick.style.top = `${top}px`;
        this.stickOrigin = { x: area.left + left, y: area.top + top };
        this.stick.classList.add("visible");
        this.stickArea.setPointerCapture(e.pointerId);
      } else {
        const rect = this.stick.getBoundingClientRect();
        this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.stick.setPointerCapture(e.pointerId);
      }
      this.moveStick(e);
    };
    this.stickArea.addEventListener("pointerdown", (e) => beginStick(e, e.target === this.stickArea));
    // Keep direct interactions on the visible stick centered on its current base.
    this.stick.addEventListener("pointerdown", (e) => beginStick(e, false));
    const moveStick = (e: PointerEvent) => {
      if (e.pointerId === this.joystickPointer) this.moveStick(e);
    };
    this.stickArea.addEventListener("pointermove", moveStick);
    this.stick.addEventListener("pointermove", moveStick);
    const releaseStick = (e: PointerEvent) => {
      if (e.pointerId === this.joystickPointer) {
        this.sources.delete(e.pointerId);
        this.joystickPointer = null;
        this.steeringX = 0;
        this.steeringY = 0;
        this.thumb.style.transform = "translate(0px,0px)";
        this.stick.classList.remove("visible");
      }
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      for (const target of [this.stickArea, this.stick])
        target.addEventListener(event, (e) => releaseStick(e as PointerEvent));
    const canvas = document.getElementById("universe")!;
    canvas.addEventListener("pointerdown", (e) => {
      const bounds = canvas.getBoundingClientRect();
      if (e.pointerType !== "touch" || !actions.enabled() || e.clientX < bounds.left + bounds.width / 2) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinchDistance = this.pointerDistance();
    });
    canvas.addEventListener("pointermove", (e) => {
      const previous = this.lookPointers.get(e.pointerId);
      if (!previous || !actions.enabled()) return;
      const oldPinchDistance = this.pinchDistance;
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.lookPointers.size > 1) {
        const nextPinchDistance = this.pointerDistance();
        if (oldPinchDistance !== null && nextPinchDistance !== null)
          actions.zoom((oldPinchDistance - nextPinchDistance) * 0.025);
        this.pinchDistance = nextPinchDistance;
        return;
      }
      actions.look(
        (e.clientX - previous.x) * 0.75,
        (e.clientY - previous.y) * 0.75,
      );
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(event, (e) => {
        this.lookPointers.delete((e as PointerEvent).pointerId);
        if (this.lookPointers.size < 2) this.pinchDistance = null;
      });
    this.hold("touch-reverse", () => actions.onFoot() ? [] : ["KeyS"]);
    this.hold("touch-forward", () => actions.onFoot() ? [] : ["KeyW"]);
    this.hold("touch-roll-left", () => actions.onFoot()||actions.inVehicle() ? [] : ["RollLeft"]);
    this.hold("touch-roll-right", () => actions.onFoot()||actions.inVehicle() ? [] : ["RollRight"]);
    this.hold("touch-steer-left", () => actions.inVehicle() ? ["CarLeft"] : []);
    this.hold("touch-steer-right", () => actions.inVehicle() ? ["CarRight"] : []);
    document.getElementById("touch-action")!.onclick = () => {
      if (actions.enabled()) actions.interact();
    };
    document.getElementById("touch-launch")!.onclick = () => {
      if (actions.enabled()) actions.takeoff();
    };
    const jumpButton = document.getElementById("touch-jump")!;
    jumpButton.addEventListener("pointerdown", (e) => {
      if (!actions.enabled()) return;
      e.preventDefault();
      actions.jump();
    });
    jumpButton.onclick = () => {
      if (actions.enabled()) actions.jump();
    };
    const weaponButton=document.getElementById('touch-weapon')!;
    weaponButton.onclick=()=>{if(actions.enabled())actions.useWeapon();};
    addEventListener("pointerup", (e) => this.sources.delete(e.pointerId));
    addEventListener("pointercancel", (e) => this.sources.delete(e.pointerId));
  }
  get keys() {
    return new Set([...this.sources.values()].flatMap((keys) => [...keys]));
  }
  get steering() {
    return { x: this.steeringX, y: this.steeringY };
  }
  private pointerDistance() {
    if (this.lookPointers.size < 2) return null;
    const points = [...this.lookPointers.values()];
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  private moveStick(e: PointerEvent) {
    const rect = this.stick.getBoundingClientRect(),
      radius = rect.width * 0.34;
    let x = (e.clientX - this.stickOrigin.x) / radius,
      y = (e.clientY - this.stickOrigin.y) / radius;
    const length = Math.hypot(x, y);
    const magnitude = Math.min(length, 1);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    this.thumb.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    const keys = new Set<string>();
    if (this.actions.onFoot()) {
      this.steeringX = 0;
      this.steeringY = 0;
      if (x > 0.25) keys.add("KeyD");
      if (x < -0.25) keys.add("KeyA");
      if (y < -0.25) keys.add("KeyW");
      if (y > 0.25) keys.add("KeyS");
      if (magnitude > 0.68) keys.add("ShiftLeft");
    } else if (this.actions.inVehicle()) {
      this.steeringX = 0;
      this.steeringY = 0;
    } else {
      this.steeringX = x;
      this.steeringY = y;
    }
    this.sources.set(e.pointerId, keys);
  }
  private hold(id: string, keys: () => string[]) {
    const button = document.getElementById(id)!;
    const clear = () => {
      button.classList.remove("pressed");
    };
    this.cleanup.add(clear);
    button.addEventListener("pointerdown", (e) => {
      if (!this.actions.enabled()) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      this.sources.set(e.pointerId, new Set(keys()));
      button.classList.add("pressed");
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(event, (e) => {
        this.sources.delete((e as PointerEvent).pointerId);
        clear();
      });
    button.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  reset() {
    this.sources.clear();
    this.joystickPointer = null;
    this.steeringX = 0;
    this.steeringY = 0;
    this.stick.classList.remove("visible");
    this.lookPointers.clear();
    this.pinchDistance = null;
    this.thumb.style.transform = "translate(0px,0px)";
    for (const clear of this.cleanup) clear();
  }
}
