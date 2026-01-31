import * as Telemetry from "./net/telemetry.ts";

export function debug(message: string) {
    console.debug(message);
}

export function info(message: string) {
    console.info(message);
}

export function error(message: string) {
    console.error(message);
    Telemetry.sendTelemetry('error',message)
}

export function warn(message: string) {
    console.warn(message);
    Telemetry.sendTelemetry('warn',message)
}