'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');
const multer = require('multer');
const manifestJSON = require('./manifest');
const systemDictionary = require('./dictionary');

// Object for icons
let iconCacheObject = {};

// Runtime variables
let systemLang = 'en';
let generatedManifest = {};

// Iconify URLs
const BASEURL = 'https://api.iconify.design/';
const error_icon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="coral" d="M11 15h2v2h-2v-2m0-8h2v6h-2V7m1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8Z"/></svg>';

function normalizeFilename(filename) {
    return filename
        .trim()
        .replace(/[^a-z0-9._-]/gi, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
}

function sprintf(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    var i = 0;
    return format.replace(/%s/g, function () {
        return args[i++];
    });
}

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error(`Cannot load sharp: ${e}`);
}

/**
 * Proxy class
 */
class ProxyEnergieflussErweitert {
    /**
     * Constructor of the Proxy class
     *
     * @param server http or https node.js object
     * @param webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
     * @param adapter web adapter object
     * @param instanceSettings instance object with common and native
     * @param app express application
     */
    constructor(server, webSettings, adapter, instanceSettings, app) {
        this.app = app;
        this.config = instanceSettings ? instanceSettings.native : {};
        this.namespace = instanceSettings
            ? instanceSettings._id.substring('system.adapter.'.length)
            : 'energiefluss-erweitert';

        this.config.route = this.config.route || `${this.namespace}/`;
        this.config.port = parseInt(this.config.port, 10) || 80;

        this.adapter = adapter;

        // remove leading slash
        if (this.config.route[0] === '/') {
            this.config.route = this.config.route.substr(1);
        }

        // Root path for this instance
        const root_path = path.join(utils.getAbsoluteDefaultDataDir(), this.namespace);

        /* Create Adapter Directory - UserFiles */
        if (!fs.existsSync(path.join(root_path, 'userFiles'))) {
            fs.mkdirSync(path.join(root_path, 'userFiles'), { recursive: true });
        }

        /* Create Folder thumbnails, if 'sharp' was found and can be used */
        if (sharp) {
            if (!fs.existsSync(path.join(root_path, 'userFiles', 'thumbnail'))) {
                fs.mkdirSync(path.join(root_path, 'userFiles', 'thumbnail'), {
                    recursive: true,
                });
            }
        }

        // Multer storage
        const storage = multer.diskStorage({
            // This defines the destination directory for storing files
            destination: function (req, file, cb) {
                cb(null, path.join(root_path, 'userFiles'));
            },
            // This defines the file name for storing files
            filename: function (req, file, cb) {
                cb(null, normalizeFilename(file.originalname));
            },
        });

        // Multer Upload
        const upload = multer({
            storage: storage,
        }).single('uploadFile');

        // Generate manifest
        async function generateManifest() {
            let shortcuts = [];
            // Get language
            const systemConfig = await adapter.getForeignObjectAsync('system.config');
            if (systemConfig?.common.language) {
                systemLang = systemConfig?.common.language;
            }

            // Get instances
            const instanceObj = await adapter.getObjectView('system', 'instance', {
                startkey: 'system.adapter.energiefluss-erweitert',
                endkey: 'system.adapter.energiefluss-erweitert.\u9999',
            });
            if (instanceObj) {
                for (let i = 0; i < instanceObj.rows.length; i++) {
                    shortcuts.push({
                        name: sprintf(systemDictionary['pwa_shortcut_open'][systemLang], i),
                        url: `/energiefluss-erweitert/?instance=${i}`,
                        description: systemDictionary['pwa_shortcut_description'][systemLang],
                        icons: [
                            {
                                src: '/energiefluss-erweitert/img/icons/android/android-launchericon-96-96.png',
                                type: 'image/png',
                                sizes: '96x96',
                            },
                        ],
                    });
                }

                generatedManifest = {
                    ...manifestJSON, // Original
                    description: systemDictionary['pwa_description'][systemLang],
                    shortcuts: shortcuts,
                };
            }
        }

        function isPrivateIP(ip) {
            const privateRanges = [
                /^10\./, // 10.0.0.0 – 10.255.255.255
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0 – 172.31.255.255
                /^192\.168\./, // 192.168.0.0 – 192.168.255.255
                /^127\./, // Loopback 127.0.0.0 – 127.255.255.255
                /^169\.254\./, // Link-local 169.254.0.0 – 169.254.255.255
                /^::1$/, // Loopback ::1
                /^fe80:/, // Link-local fe80::/10
                /^fc00:/, // Unique Local Address (ULA) fc00::/7 (inkl. fd00::/8)
                /^fd00:/, // ULA fd00::/8 (most common part)
            ];
            return privateRanges.some(regex => regex.test(ip));
        }

        function normalizeIP(ip) {
            return ip.startsWith('::ffff:') ? ip.substring(7) : ip;
        }

        // Normal requests
        this.app.use(`/${this.config.route}`, (req, res, next) => {
            // Pre-Check, if posting something
            if (req.method == 'GET') {
                /* Variables for Icon-Proxy */
                let query = url.parse(req.url, true).query;
                let message;

                const fileName = path.join(root_path, req.url.substring(1));
                const normalized_filename = path.resolve(fileName);

                /* Set header for response */
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

                switch (query.serve) {
                    default:
                        if (normalized_filename.startsWith(root_path)) {
                            if (fs.existsSync(normalized_filename)) {
                                const file = fs.statSync(normalized_filename);
                                if (!file.isDirectory()) {
                                    res.setHeader('Cache-Control', 'max-age=2592000');
                                    res.sendFile(normalized_filename);
                                } else {
                                    res.status(404).send(
                                        `[${this.namespace}] Requested "${normalized_filename}" is a directory!`,
                                    );
                                }
                            } else {
                                res.status(404).send(`[${this.namespace}] File "${normalized_filename}" not found!`);
                            }
                        } else {
                            res.status(403).send(`[${this.namespace}] Access to file "${normalized_filename}" denied!`);
                        }
                        break;
                    case '':
                        res.status(404).send(
                            'Request could not be handled! Please make sure, to request things via: ?serve=<request>',
                        );
                        break;

                    case 'manifest': {
                        generateManifest();
                        const sendManifest = {
                            ...generatedManifest,
                            start_url: `/energiefluss-erweitert/?instance=${query.instance}`,
                        };
                        res.status(200).json(sendManifest);
                        break;
                    }

                    case 'healthCheck':
                        res.status(200).send(`${Date.now()}`);
                        break;

                    case 'ip': {
                        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                        // If Proxy returns more than one IPs
                        if (ip.includes(',')) {
                            ip = ip.split(',')[0].trim();
                        }

                        ip = normalizeIP(ip); // Clean IPv4-mapped IPv6-Adressen

                        res.status(200).json({ ip: ip, internal: isPrivateIP(ip) });
                        break;
                    }

                    case 'checkImage':
                        if (query.image) {
                            const imageToCheck = path.join(root_path, 'userFiles', query.image);
                            adapter.log.debug(`Checking image: ${imageToCheck}`);
                            if (fs.existsSync(imageToCheck)) {
                                res.status(200).send(`[${this.namespace}] image ${query.image} exists!`);
                            } else {
                                res.status(404).send(`[${this.namespace}] image ${query.image} does not exist!`);
                            }
                        } else {
                            res.status(404).send(`[${this.namespace}] No image for checking provided!`);
                        }
                        break;

                    case 'getUploads': {
                        let filePath = '/';

                        /* If thumbnail folder is found, we can use the thumbnails to be delivered */
                        if (fs.existsSync(path.join(root_path, 'userFiles', 'thumbnail'))) {
                            filePath = '/thumbnail/';
                        }

                        const listUploads = path.join(root_path, 'userFiles');
                        const dirents = fs.readdirSync(listUploads, {
                            withFileTypes: true,
                        });
                        const filesNames = dirents.filter(dirent => dirent.isFile()).map(dirent => dirent.name);

                        res.contentType('application/json').status(200).send({ files: filesNames, path: filePath });
                        break;
                    }

                    case 'deleteUpload': {
                        if (query.image) {
                            const imageToDelete = path.join(root_path, 'userFiles', query.image);
                            adapter.log.debug(`Deleting image: ${imageToDelete}`);
                            if (fs.existsSync(imageToDelete)) {
                                fs.unlink(imageToDelete, err => {
                                    if (err) {
                                        adapter.log.error(
                                            `[${this.namespace}] Could not delete the file ${imageToDelete}. Error: ${err}`,
                                        );
                                        res.status(200).json({ error: err, filename: null });
                                    } else {
                                        // Delete the thumbnail as well
                                        if (
                                            fs.existsSync(path.join(root_path, 'userFiles', 'thumbnail', query.image))
                                        ) {
                                            fs.unlinkSync(path.join(root_path, 'userFiles', 'thumbnail', query.image));
                                        }
                                        res.status(200).json({
                                            error: null,
                                            filename: query.image,
                                            msg: 'File successfully deleted!',
                                        });
                                    }
                                });
                            } else {
                                res.status(200).json({
                                    error: 'File not found!',
                                    filename: query.image,
                                    msg: '',
                                });
                            }
                        } else {
                            res.status(404).json({ error: 'No image for deletion provided!', filename: null, msg: '' });
                        }

                        break;
                    }
                    case 'listCache':
                        res.status(200).json(iconCacheObject);
                        break;

                    case 'icon': {
                        if (query.icon) {
                            const queryIcon = `${query.icon}|${query.width || ''}|${query.height || ''}|${
                                query.flip || ''
                            }|${query.rotate || ''}`;
                            res.contentType('application/javascript');
                            // Check, if icon is available in Cache
                            if (Object.prototype.hasOwnProperty.call(iconCacheObject, queryIcon)) {
                                iconCacheObject[queryIcon].status = 'served via Cache';
                                res.status(200).send(JSON.stringify(iconCacheObject[queryIcon]));
                                adapter.log.debug(
                                    `[${this.namespace}] Icon-Proxy: Icon ${query.icon} served via: ${iconCacheObject[queryIcon].status}`,
                                );
                            } else {
                                let icon = query.icon.split(':');
                                let url = `${BASEURL}${icon[0]}/${icon[1]}.svg?width=${query.width}&height=${query.height}&flip=${query.flip}&rotate=${query.rotate}`;
                                https
                                    .get(url, result => {
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
                                                        status: 'served via Server',
                                                    };
                                                    res.status(200).send(JSON.stringify(iconCacheObject[queryIcon]));
                                                } else {
                                                    // Put Icon into cache
                                                    iconCacheObject[queryIcon] = {
                                                        icon: error_icon,
                                                        message: 'Icon not found!',
                                                        status: 'served via Server',
                                                    };
                                                    res.status(200).send(JSON.stringify(iconCacheObject[queryIcon]));
                                                }
                                                adapter.log.debug(
                                                    `[${this.namespace}] Icon ${query.icon} served via: ${iconCacheObject[queryIcon].status}`,
                                                );
                                            } else {
                                                // Server down or not found
                                                res.status(200).send(JSON.stringify(error_icon));
                                            }
                                        });
                                    })
                                    .on('error', err => {
                                        adapter.log.error(`[${this.namespace}] Icon-Proxy: Error: ', ${err.message}`);
                                    });
                            }
                        } else {
                            res.status(404).send(`[${this.namespace}] Icon-Proxy: Error: No Icon specified!`);
                        }
                        break;
                    }
                }
            } else {
                next();
            }
        });

        this.app.post(`/${this.config.route}upload`, (req, res) => {
            upload(req, res, async () => {
                // Set header for response
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

                // Basic response
                let response = {
                    error: null,
                    filename: req.file.filename,
                    success: true,
                    path: '/',
                };

                try {
                    if (sharp) {
                        adapter.log.info(`[${this.namespace}] Trying to create thumbnail for ${req.file.filename}!`);

                        /* sharp action */
                        await sharp(req.file.path, { failOnError: false })
                            .resize({
                                width: 100,
                                fit: 'contain',
                            })
                            .toFile(path.join(root_path, 'userFiles', 'thumbnail', req.file.filename))
                            .catch(err => {
                                adapter.log.warn(`[${this.namespace}] Thumbnail could not be created! Error: ${err}`);
                            })
                            .then(() => {
                                adapter.log.info(`[${this.namespace}] Thumbnail created!`);
                                // Inform about thumbnail
                                response.path = '/thumbnail/';
                            });
                    }
                } catch (err) {
                    adapter.log.warn(
                        `[${this.namespace}] Error while using sharp for thumbnail creation! Error: ${err}`,
                    );
                    return;
                }
                return res.status(200).json(response);
            });
        });
    }
}

module.exports = ProxyEnergieflussErweitert;
