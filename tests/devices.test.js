import test from "node:test";
import assert from "node:assert/strict";
import { chooseReconnectDevice } from "../site/js/devices.js";

const input = (deviceId, groupId, label) => ({ kind: "audioinput", deviceId, groupId, label });

test("reconnect keeps the exact assigned microphone when available", () => {
  const devices = [input("mic-b", "group-b", "USB Mic"), input("mic-a", "group-a", "USB Mic")];
  assert.equal(chooseReconnectDevice(devices, { deviceId: "mic-a", groupId: "group-a", label: "USB Mic" }).deviceId, "mic-a");
});

test("reconnect accepts a changed id only for an unambiguous device", () => {
  assert.equal(
    chooseReconnectDevice([input("new-id", "same-group", "Mic")], { deviceId: "old-id", groupId: "same-group", label: "Mic" }).deviceId,
    "new-id",
  );
  assert.equal(
    chooseReconnectDevice([input("one", "", "USB Mic"), input("two", "", "USB Mic")], { deviceId: "gone", groupId: "", label: "USB Mic" }),
    null,
  );
});
