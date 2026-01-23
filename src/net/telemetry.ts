import * as axios from "axios";

const hostname_regex = /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/;
const ip_regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
let proto = "http";
export class Telemetry {
    static enabled: boolean = false;
    static url: URL;
    static push(data: string, level: string) {
        if (!enabled) return;
        const telemetry = {
            timestamp: Date.now(),
            message: data,
            level: level
        }
        if (url && url instanceof URL) {
            axios.put(url.toString(), JSON.stringify(telemetry)).then(() => {
            })
        }
    }

    static setCS(host: string, port: number) {
        if (hostname_regex.test(host) || ip_regex.test(host) && port) {
            URL = new URL(`${proto}://${host}:${port}/telemetry`)
        }
    }
}