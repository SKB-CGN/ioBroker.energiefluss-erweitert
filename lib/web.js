'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');
const mime = require('mime');

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
            const fileName = path.join(root_path, req.url.substring(1));
            const normalized_filename = path.resolve(fileName);

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

            this.adapter.log.info(`You called a demo web extension with path ${req.url}`);
        });
    }
}

module.exports = ProxyEnergieflussErweitert;
