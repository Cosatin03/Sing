import { PitchInput } from "./pitch.js";

const INPUT_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

export function chooseReconnectDevice(devices, identity) {
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const exact = inputs.find((device) => device.deviceId === identity.deviceId);
  if (exact) return exact;
  if (identity.groupId) {
    const grouped = inputs.find((device) => device.groupId === identity.groupId);
    if (grouped) return grouped;
  }
  if (identity.label) {
    const labelled = inputs.filter((device) => device.label === identity.label);
    if (labelled.length === 1) return labelled[0];
  }
  return null;
}

class RecoveringPitchInput {
  constructor(manager, configuration, settings, identity) {
    this.manager = manager;
    this.configuration = configuration;
    this.settings = {
      ...settings,
      inputGain: configuration.inputGain,
      monitorVolume: configuration.monitorVolume,
    };
    this.identity = identity;
    this.input = null;
    this.track = null;
    this.status = "reconnecting";
    this.stopped = false;
    this.connecting = null;
    this.retryTimer = 0;
    this.muteTimer = 0;
    this.sequence = 0;
    this.lastInnerSampleId = 0;
    this.latestReading = { frequency: null, clarity: 0, rms: 0, sampleId: 0, timeMs: 0 };
    this.onEnded = () => this.handleEnded();
    this.onMute = () => this.handleMute();
    this.onUnmute = () => this.handleUnmute();
  }

  async start() {
    await this.reconnect(true);
    return this;
  }

  async openStream() {
    let candidate = chooseReconnectDevice(await navigator.mediaDevices.enumerateDevices(), this.identity);
    candidate ||= { deviceId: this.identity.deviceId };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...INPUT_CONSTRAINTS, deviceId: { exact: candidate.deviceId } },
      });
      this.identity = {
        deviceId: candidate.deviceId,
        groupId: candidate.groupId || this.identity.groupId,
        label: candidate.label || this.identity.label,
      };
      return stream;
    } catch (error) {
      const refreshed = chooseReconnectDevice(await navigator.mediaDevices.enumerateDevices(), this.identity);
      if (!refreshed || refreshed.deviceId === candidate.deviceId) throw error;
      this.identity = { deviceId: refreshed.deviceId, groupId: refreshed.groupId, label: refreshed.label };
      return navigator.mediaDevices.getUserMedia({
        audio: { ...INPUT_CONSTRAINTS, deviceId: { exact: refreshed.deviceId } },
      });
    }
  }

  async reconnect(initial = false) {
    if (this.stopped) return;
    if (this.connecting) return this.connecting;
    clearTimeout(this.retryTimer);
    clearTimeout(this.muteTimer);
    this.status = "reconnecting";
    this.connecting = (async () => {
      try {
        const stream = await this.openStream();
        if (this.stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.disposeInput();
        this.input = new PitchInput(stream, this.manager.context, this.settings);
        this.lastInnerSampleId = 0;
        this.track = stream.getAudioTracks()[0] || null;
        this.track?.addEventListener("ended", this.onEnded);
        this.track?.addEventListener("mute", this.onMute);
        this.track?.addEventListener("unmute", this.onUnmute);
        this.status = "connected";
      } catch (error) {
        this.status = "reconnecting";
        if (initial) throw error;
        this.scheduleReconnect(1200);
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  handleEnded() {
    if (this.stopped) return;
    this.status = "reconnecting";
    this.disposeInput();
    this.scheduleReconnect(350);
  }

  handleMute() {
    if (this.stopped) return;
    this.status = "reconnecting";
    clearTimeout(this.muteTimer);
    this.muteTimer = setTimeout(() => {
      if (this.track?.muted || this.track?.readyState === "ended") this.reconnect();
    }, 800);
  }

  handleUnmute() {
    if (this.stopped) return;
    clearTimeout(this.muteTimer);
    this.status = "connected";
  }

  scheduleReconnect(delay = 800) {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = 0;
      this.reconnect();
    }, delay);
  }

  checkConnection() {
    if (this.stopped || this.status === "connected") return;
    clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    this.reconnect();
  }

  read(timeMs) {
    if (!this.input || this.status !== "connected") return this.latestReading;
    const reading = this.input.read(timeMs);
    if (reading.sampleId > this.lastInnerSampleId) {
      this.lastInnerSampleId = reading.sampleId;
      this.latestReading = { ...reading, sampleId: ++this.sequence };
    }
    return this.latestReading;
  }

  setInputGain(value) {
    this.settings.inputGain = value;
    this.input?.setInputGain(value);
  }

  setMonitoring(enabled, volume) {
    this.settings.monitoring = enabled;
    this.settings.monitorVolume = volume;
    this.input?.setMonitoring(enabled, volume);
  }

  setMonitorVolume(value) {
    this.settings.monitorVolume = value;
    this.input?.setMonitorVolume(value);
  }

  disposeInput() {
    this.track?.removeEventListener("ended", this.onEnded);
    this.track?.removeEventListener("mute", this.onMute);
    this.track?.removeEventListener("unmute", this.onUnmute);
    this.track = null;
    this.input?.stop();
    this.input = null;
    this.latestReading = {
      frequency: null,
      clarity: 0,
      rms: 0,
      sampleId: this.sequence,
      timeMs: this.latestReading.timeMs,
    };
  }

  stop() {
    this.stopped = true;
    this.status = "stopped";
    clearTimeout(this.retryTimer);
    clearTimeout(this.muteTimer);
    this.disposeInput();
    this.manager.inputs.delete(this);
  }
}

export class DeviceManager {
  constructor() {
    this.context = null;
    this.permissionGranted = false;
    this.inputs = new Set();
    navigator.mediaDevices?.addEventListener?.("devicechange", () => {
      this.inputs.forEach((input) => input.checkConnection());
    });
  }

  async unlock() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Dieser Browser unterstützt keine Mikrofonaufnahme. Nutze aktuelles Chrome oder Edge über HTTPS.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    this.permissionGranted = true;
    return this.list();
  }

  async list() {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((device) => device.kind === "audioinput"),
      outputs: devices.filter((device) => device.kind === "audiooutput"),
    };
  }

  async openInputs(configurations, settings = {}) {
    if (!configurations.length) return [];
    this.context ||= new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();

    const opened = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const configuration of configurations) {
        const deviceId = configuration.deviceId;
        if (!deviceId) throw new Error("Jedem Spieler muss ein Mikrofon zugewiesen sein.");
        const device = devices.find((candidate) => candidate.kind === "audioinput" && candidate.deviceId === deviceId);
        const input = new RecoveringPitchInput(this, configuration, settings, {
          deviceId,
          groupId: device?.groupId || "",
          label: device?.label || "",
        });
        await input.start();
        this.inputs.add(input);
        opened.push(input);
      }
      return opened;
    } catch (error) {
      opened.forEach((input) => input.stop());
      throw error;
    }
  }

  async setOutput(audioElement, deviceId) {
    const target = deviceId || "default";
    let mediaSupported = true;
    let monitorSupported = true;
    if (target !== "default") {
      if (typeof audioElement.setSinkId === "function") await audioElement.setSinkId(target);
      else mediaSupported = false;
      if (this.context && typeof this.context.setSinkId === "function") await this.context.setSinkId(target);
      else if (this.context) monitorSupported = false;
    }
    return { supported: mediaSupported, monitorSupported };
  }
}

export function deviceLabel(device, index, type) {
  return device.label || `${type} ${index + 1}`;
}
