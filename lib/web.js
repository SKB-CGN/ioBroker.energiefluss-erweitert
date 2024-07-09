'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');
const mime = require('mime');
const url = require('url');
const https = require('https');

// Object for icons
let iconCacheObject = {};

const BASEURL = 'https://api.iconify.design/';
const error_icon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="coral" d="M11 15h2v2h-2v-2m0-8h2v6h-2V7m1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8Z"/></svg>';

/**
 * Proxy class
 *
 * Read files from localDisk server
 *
 * @class
 * @param {object} server http or https node.js object
 * @param {object} webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
 * @param {object} adapter web adapter object
 * @param {object} instanceSettings instance object with common and native
 * @param {object} app express application
 * @return {object} object instance
 */
class ProxyEnergieflussErweitert {
    constructor(server, webSettings, adapter, instanceSettings, app) {
        this.app = app;
        this.config = instanceSettings ? instanceSettings.native : {};
        this.namespace = instanceSettings ? instanceSettings._id.substring('system.adapter.'.length) : 'energiefluss-erweitert';

        this.config.route = this.config.route || `${this.namespace}/`;
        this.config.port = parseInt(this.config.port, 10) || 80;

        this.adapter = adapter;

        // remove leading slash
        if (this.config.route[0] === '/') {
            this.config.route = this.config.route.substr(1);
        }

        const root_path = path.join(utils.getAbsoluteDefaultDataDir(), this.namespace);

        this.app.use("/" + this.config.route, (req, res) => {
            /* Variables for Icon-Proxy */
            let query = url.parse(req.url, true).query;
            let callback = query.callback;
            let message;

            const fileName = path.join(root_path, req.url.substring(1));
            const normalized_filename = path.resolve(fileName);

            switch (query.serve) {
                default:
                    if (normalized_filename.startsWith(root_path)) {
                        res.setHeader("Access-Control-Allow-Origin", "*");
                        res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                        if (fs.existsSync(normalized_filename)) {
                            const file = fs.statSync(normalized_filename);
                            if (!file.isDirectory()) {
                                let data;
                                try {
                                    data = fs.readFileSync(normalized_filename);
                                } catch (e) {
                                    res.status(500).send(`[${this.namespace}] Cannot read requested file: ${e}`);
                                    return;
                                }
                                res.contentType(mime.getType(path.extname(normalized_filename).substring(1)) || "html");
                                res.status(200).send(data);
                            } else {
                                res.status(404).send(`[${this.namespace}] Requested "${normalized_filename}" is a directory!`);
                            }
                        } else {
                            res.status(404).send(`[${this.namespace}] File "${normalized_filename}" not found!`);
                        }
                    } else {
                        res.status(403).send(`[${this.namespace}] Access to file "${normalized_filename}" denied!`);
                    }
                    break;
                case '':
                    res.status(404).send("Request could not be handled! Please make sure, to request the icon via: ?serve=icon&icon=NameOfIcon");
                    break;

                case 'listCache':
                    res.contentType("application/json");
                    res.status(200).send(JSON.stringify(iconCacheObject));
                    break;

                case "icon":
                    if (query.icon) {
                        const queryIcon = `${query.icon}|${query.width || ''}|${query.height || ''}|${query.flip || ''}|${query.rotate || ''}`;
                        res.contentType("application/javascript");
                        // Check, if icon is available in Cache
                        if (iconCacheObject.hasOwnProperty(queryIcon)) {
                            iconCacheObject[queryIcon].status = 'served via Cache';
                            res.status(200).send(`${callback}(${JSON.stringify(iconCacheObject[queryIcon])})`);
                            adapter.log.debug(`[${this.namespace}] Icon-Proxy: Icon ${query.icon} served via: ${iconCacheObject[queryIcon].status}`);
                        } else {
                            let icon = query.icon.split(":");
                            let url = `${BASEURL}${icon[0]}/${icon[1]}.svg?width=${query.width}&height=${query.height}&flip=${query.flip}&rotate=${query.rotate}`;
                            https.get(url, result => {
                                let data = [];
                                result.on('data', chunk => {
                                    data.push(chunk);
                                });

                                result.on('end', () => {
                                    if (result.statusCode >= 200 && result.statusCode <= 299) {
                                        message = Buffer.concat(data).toString();
                                        if (message != 404) {
                                            // Put Icon into cache
                                            iconCacheObject[queryIcon] = {
                                                icon: message,
                                                status: 'served via Server'
                                            }
                                            res.status(200).send(`${callback}(${JSON.stringify(iconCacheObject[queryIcon])})`);
                                        } else {
                                            // Put Icon into cache
                                            iconCacheObject[queryIcon] = {
                                                icon: error_icon,
                                                message: 'Icon not found!',
                                                status: 'served via Server'
                                            }
                                            res.status(200).send(`${callback}(${JSON.stringify(iconCacheObject[queryIcon])})`);
                                        }
                                        adapter.log.debug(`[${this.namespace}] Icon ${query.icon} served via: ${iconCacheObject[queryIcon].status}`);
                                    } else {
                                        // Server down or not found
                                        res.status(200).send(`${callback}(${JSON.stringify(error_icon)})`);
                                    }
                                });
                            }).on('error', err => {
                                adapter.log.error(`[${this.namespace}] Icon-Proxy: Error: ', ${err.message}`);
                            });
                        }
                    } else {
                        res.status(404).send(`[${this.namespace}] Icon-Proxy: Error: No Icon specified!`);
                    }
                    break;
            }
        });
    }
}

module.exports = ProxyEnergieflussErweitert;
