import * as axios from "axios";

const hostname_regex = /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/;
const ip_regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
let proto = "http";
export const Telemetry = {
    enabled: false,
    url: URL,
    async push(data: string, level: string) {
        if (!enabled) return;
        const telemetry = {
            timestamp: Date.now(),
            message: data,
            level: level
        }
        if (url && url instanceof URL) {
            const response = await fetch(url.toString(), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(telemetry)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }
    },
    setCS(host: string, port: number) {
        if (hostname_regex.test(host) || ip_regex.test(host) && port) {
            URL = new URL(`${proto}://${host}:${port}/telemetry`)
        }
    }
}