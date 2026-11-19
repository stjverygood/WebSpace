export interface MobileActions {
  enabled: () => boolean;
  onFoot: () => boolean;
  look: (x: number, y: number) => void;
  interact: () => void;
  takeoff: () => void;
  jump: () => void;
}

/** Each finger owns its input until pointerup/cancel; releasing one never cancels another. */
export class MobileControls {
  private sources = new Map<number, Set<string>>();
  private joystickPointer: number | null = null;
  private lookPointers = new Map<number, { x: number; y: number }>();
  private cleanup = new Set<() => void>();
  private stick = document.getElementById("joystick")!;
  private thumb = document.getElementById("joystick-thumb")!;
  private actions: MobileActions;
  constructor(actions: MobileActions) {
    this.actions = actions;
    this.stick.addEventListener("pointerdown", (e) => {
      if (!actions.enabled() || this.joystickPointer !== null) return;
      e.preventDefault();
      this.joystickPointer = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.moveStick(e);
    });
    this.stick.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.joystickPointer) this.moveStick(e);
    });
    const releaseStick = (e: PointerEvent) => {
      if (e.pointerId === this.joystickPointer) {
        this.sources.delete(e.pointerId);
        this.joystickPointer = null;
        this.thumb.style.transform = "translate(0px,0px)";
      }
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      this.stick.addEventListener(event, (e) =>
        releaseStick(e as PointerEvent),
      );
    const canvas = document.getElementById("universe")!;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || !actions.enabled()) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("pointermove", (e) => {
      const previous = this.lookPointers.get(e.pointerId);
      if (!previous || !actions.enabled()) return;
      actions.look(
        (e.clientX - previous.x) * 0.75,
        (e.clientY - previous.y) * 0.75,
      );
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(event, (e) =>
        this.lookPointers.delete((e as PointerEvent).pointerId),
      );
    this.hold("touch-boost", () => actions.onFoot() ? ["ShiftLeft"] : []);
    this.hold("touch-reverse", () => actions.onFoot() ? [] : ["KeyS"]);
    this.hold("touch-forward", () => actions.onFoot() ? [] : ["KeyW"]);
    this.hold("touch-brake", () => ["Space"]);
    this.hold("touch-roll-left", () => ["KeyQ"]);
    this.hold("touch-roll-right", () => ["KeyE"]);
    document.getElementById("touch-action")!.onclick = () => {
      if (actions.enabled()) actions.interact();
    };
    document.getElementById("touch-launch")!.onclick = () => {
      if (actions.enabled()) actions.takeoff();
    };
    document.getElementById("touch-jump")!.onclick = () => {
      if (actions.enabled()) actions.jump();
    };
    addEventListener("pointerup", (e) => this.sources.delete(e.pointerId));
    addEventListener("pointercancel", (e) => this.sources.delete(e.pointerId));
  }
  get keys() {
    return new Set([...this.sources.values()].flatMap((keys) => [...keys]));
  }
  private moveStick(e: PointerEvent) {
    const rect = this.stick.getBoundingClientRect(),
      radius = rect.width * 0.34;
    let x = (e.clientX - rect.left - rect.width / 2) / radius,
      y = (e.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    this.thumb.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    const keys = new Set<string>();
    if (this.actions.onFoot()) {
      if (x > 0.25) keys.add("KeyD");
      if (x < -0.25) keys.add("KeyA");
      if (y < -0.25) keys.add("KeyW");
      if (y > 0.25) keys.add("KeyS");
    } else {
      if (x < -0.25) keys.add("ArrowLeft");
      if (x > 0.25) keys.add("ArrowRight");
      if (y < -0.25) keys.add("ArrowUp");
      if (y > 0.25) keys.add("ArrowDown");
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
    this.lookPointers.clear();
    this.thumb.style.transform = "translate(0px,0px)";
    for (const clear of this.cleanup) clear();
  }
}
