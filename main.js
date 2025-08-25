'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');
const systemDictionary = require('./lib/dictionary.js');
let instanceDir;
const backupDir = '/backup';

/* Variables for runtime */
let globalConfig = {};
let sourceObject = {};
let settingsObj = {};
let rawValues = {};

let outputValues = {
    values: {},
    unit: {},
    animations: {},
    fillValues: {},
    borderValues: {},
    prepend: {},
    append: {},
    css: {},
    override: {},
    img_href: {},
};

let relativeTimeCheck = {};
let globalInterval;

let subscribeArray = [];

let systemLang = 'en';

class EnergieflussErweitert extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'energiefluss-erweitert',
            useFormatDate: true,
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Language
        systemLang = this.language ?? 'en';

        // Password
        this.password = this.config.password;
        if (this.password.toString().length > 0) {
            this.log.info('Workspace configuration is password protected!');
        } else {
            this.log.warn('Workspace configuration is NOT password protected!');
        }

        // Initialize your adapter here

        /* Create Adapter Directory - Backup */
        instanceDir = utils.getAbsoluteInstanceDataDir(this);
        if (!fs.existsSync(instanceDir + backupDir)) {
            fs.mkdirSync(instanceDir + backupDir, { recursive: true });
        }

        /* Check, if we have an old backup state */
        let tmpBackupState = await this.getStateAsync('backup');
        if (tmpBackupState) {
            let tmpBackup = JSON.parse(tmpBackupState.val);
            this.log.info('Migrating old backup to new strategy. Please wait!');
            if (Object.keys(tmpBackup).length > 0) {
                this.log.info(`${Object.keys(tmpBackup).length} Backup's found. Converting!`);
                for (var key of Object.keys(tmpBackup)) {
                    let datetime = key;
                    let [date, time] = datetime.split(', ');
                    let [day, month, year] = date.split('.');
                    let [hour, minutes, seconds] = time.split(':');

                    let fileName = new Date(year, month - 1, day, hour, minutes, seconds).getTime();
                    const newFilePath = path.join(instanceDir + backupDir, `BACKUP_${fileName}.json`);
                    fs.writeFile(newFilePath, JSON.stringify(tmpBackup[key]), err => {
                        if (err) {
                            this.log.error(`Could not create Backup ${newFilePath}. Error: ${err}`);
                        }
                    });
                }
            }
            // After creation of new backup - delete the state
            this.log.info('Convertion of backups finished');
        }

        // Delete old Objects
        this.delObjectAsync('backup');
        this.delObjectAsync('battery_remaining');

        this.log.info('Adapter started. Loading config!');

        this.getConfig();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback	Callback function
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            this.clearInterval(globalInterval);
            this.log.info('Cleared interval for relative values!');
            callback();
        } catch {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id	ID of the state
     * @param state State itself
     */
    async onStateChange(id, state) {
        // The state was changed
        if (id && state) {
            // The state is acknowledged
            if (state.ack) {
                this.log.debug('Refreshing ACK state from foreign state!');
                await this.refreshData(id, state);
            }

            // For userdata and Javascript
            if (
                id.toLowerCase().startsWith('0_userdata.') ||
                id.toLowerCase().startsWith('javascript.') ||
                id.toLowerCase().startsWith('alias.')
            ) {
                this.log.debug(`Refreshing state from user environment! ${id}`);
                await this.refreshData(id, state);
            }
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param obj Message Object
     */
    async onMessage(obj) {
        //this.log.debug(`[onMessage] received command: ${obj.command} with message: ${JSON.stringify(obj.message)}`);
        if (obj && obj.message) {
            if (typeof obj.message === 'object') {
                // Request the list of Backups
                let fileList = [];
                switch (obj.command) {
                    case '_getBackups': {
                        const listBackups = path.join(instanceDir + backupDir);
                        fs.readdir(listBackups, (err, files) => {
                            if (err) {
                                this.sendTo(obj.from, obj.command, { error: err }, obj.callback);
                            } else {
                                files.forEach(file => {
                                    let tmpFile = path.parse(file).name;
                                    tmpFile = tmpFile.replace('BACKUP_', '');
                                    fileList.push(tmpFile);
                                });
                                this.sendTo(obj.from, obj.command, { error: null, data: fileList }, obj.callback);
                            }
                        });
                        break;
                    }
                    case '_restoreBackup': {
                        // Restore Backup
                        this.log.info('Starting restoring Backup from disk!');
                        const restorePath = path.join(instanceDir + backupDir, `BACKUP_${obj.message.filename}.json`);
                        fs.readFile(restorePath, 'utf8', (err, data) => {
                            if (err) {
                                this.log.info(`Error during ${err}`);
                                this.sendTo(obj.from, obj.command, { error: err }, obj.callback);
                            } else {
                                // Send new config back to workspace and store in state
                                this.setStateChangedAsync('configuration', {
                                    val: data,
                                    ack: true,
                                });
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    { error: null, data: JSON.parse(data) },
                                    obj.callback,
                                );
                                this.log.info('Backup restored and activated!');
                            }
                        });
                        break;
                    }
                    case '_checkProtection': {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            { error: null, data: this.password && this.password.toString().length > 0 ? true : false },
                            obj.callback,
                        );
                        break;
                    }
                    case '_checkPassword': {
                        if (obj.message.password == this.password.toString()) {
                            this.sendTo(obj.from, obj.command, { error: null, data: true }, obj.callback);
                        } else {
                            this.sendTo(obj.from, obj.command, { error: 'Password is wrong!' }, obj.callback);
                        }
                        break;
                    }
                    case '_saveConfiguration': {
                        // Store Backup
                        this.log.debug('Saving Backup to disk!');
                        const filename = new Date().getTime();
                        const storePath = path.join(instanceDir + backupDir, `BACKUP_${filename}.json`);
                        // Get current configuration
                        const tmpConfig = await this.getStateAsync('configuration');

                        fs.writeFile(storePath, tmpConfig.val, err => {
                            if (err) {
                                this.sendTo(obj.from, obj.command, { err }, obj.callback);
                            } else {
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    { error: null, data: 'Backup stored successfully!' },
                                    obj.callback,
                                );
                            }
                        });

                        // Store the new configuration in state
                        await this.setStateChangedAsync('configuration', {
                            val: JSON.stringify(obj.message),
                            ack: true,
                        });

                        // Recycle old Backups
                        fileList = [];
                        fs.readdir(instanceDir + backupDir, (err, files) => {
                            if (!err) {
                                files.forEach(file => {
                                    fileList.push(file);
                                });
                                // Walk through the list an delete all files after index 9
                                if (fileList.length > 10) {
                                    // Order the List
                                    fileList.sort((a, b) => -1 * a.localeCompare(b));
                                    for (let i = 10; i < fileList.length; i++) {
                                        fs.unlink(`${instanceDir}${backupDir}/${fileList[i]}`, err => {
                                            if (err) {
                                                this.log.warn(err);
                                            }
                                            this.log.info(`${fileList[i]} successfully deleted!`);
                                        });
                                    }
                                } else {
                                    this.log.info(
                                        'The amount of current stored backups does not exceed the number of 10!',
                                    );
                                }
                            }
                        });
                        break;
                    }
                    case '_updateElementInView': {
                        // Receive Object from ioBroker to show it in Configuration
                        const originID = obj.message.id;
                        const id = `tmp_${originID}`;
                        const originSource = obj.message.source;
                        const state = originSource ? await this.getForeignStateAsync(originSource) : null;

                        // Modify the source
                        obj.message.source = id;

                        if (state && state.val != null) {
                            let objectUnit = '';
                            rawValues[id] = state.val;

                            // Get the type if auto
                            if (obj.message.source_display == 'auto') {
                                const type = await this.getForeignObjectAsync(originSource);
                                obj.message.source_type = type.common.type;
                                if (obj.message.calculate_kw == 'none') {
                                    objectUnit = type.common.unit;
                                }
                            }

                            await this.calculateValue(id, obj.message, state);
                            this.log.debug(`Found ${obj.message.source} and calculated the value for Web-ID: ${id}!`);
                            if (Object.hasOwn(outputValues.values, id)) {
                                let returnObj = {
                                    values: {},
                                    unit: {},
                                    override: {},
                                };

                                returnObj.values[originID] = outputValues.values[id];
                                returnObj.unit[originID] = objectUnit || outputValues.unit[id];
                                returnObj.override[originID] = outputValues.override[id];

                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    {
                                        error: null,
                                        data: returnObj,
                                    },
                                    obj.callback,
                                );

                                // Delete temporary values
                                delete outputValues.override[id];
                                delete outputValues.values[id];
                                delete rawValues[id];
                            } else {
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    {
                                        error: 'There was an error, while getting the updated value!',
                                    },
                                    obj.callback,
                                );
                            }
                        } else {
                            this.sendTo(
                                obj.from,
                                obj.command,
                                {
                                    error: 'State does not exist!',
                                },
                                obj.callback,
                            );
                        }
                        break;
                    }
                    default:
                        this.log.warn(
                            `[onMessage] Received command "${obj.command}" via 'sendTo', which is not implemented!`,
                        );
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                error: `Received command "${obj.command}" via 'sendTo', which is not implemented!`,
                            },
                            obj.callback,
                        );
                        break;
                }
            } else {
                this.log.error(`[onMessage] Received incomplete message via 'sendTo'`);

                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: 'Incomplete message' }, obj.callback);
                }
            }
        }
    }

    /**
     * Converts minutes to a string representation of hours and minutes.
     *
     * @param mins - The number of minutes to convert.
     * @returns The string representation of the hours and minutes.
     */
    getMinHours(mins) {
        const m = mins % 60;
        const h = (mins - m) / 60;
        return `${h < 10 ? '0' : ''}${h.toString()}:${m < 10 ? '0' : ''}${m.toString()}`;
    }

    /**
     * Calculate the value of a given element.
     *
     * @param id - The id of the element.
     * @param obj - The object containing the source and settings for the element.
     * @param state - The state of the element.
     * @returns Value
     */
    async calculateValue(id, obj, state) {
        // prettier-ignore
        const factor = globalConfig?.datasources && Object.hasOwn(globalConfig.datasources, obj.source)
            ? (globalConfig.datasources[obj.source].factor ?? 1)
            : 1;
        let sourceValue = rawValues[obj.source] * factor;

        this.log.debug(
            `Values for: ${id} - Using source: ${obj.source} rawValue: ${
                rawValues[obj.source]
            } sourceValue: ${sourceValue} Settings: ${JSON.stringify(obj)}`,
        );

        // Decide, which type we have
        switch (obj.type) {
            default:
                outputValues.values[id] = sourceValue;
                break;
            case 'image':
                // Check, if we have a static picture or one via state
                if (obj.href) {
                    let tmpImg = await this.getForeignStateAsync(obj.href);
                    outputValues.img_href[id] = tmpImg.val || '#';
                    this.log.debug(
                        `Loading Image for ${id} with: ${JSON.stringify(obj)} Result: ${outputValues.img_href[id]}`,
                    );
                }
                break;

            case 'circle':
            case 'rect':
                // Element is not Text - It is Rect or Circle
                if (obj.fill_type != -1 && obj.fill_type) {
                    outputValues.fillValues[id] = sourceValue;
                }
                if (obj.border_type != -1 && obj.border_type) {
                    outputValues.borderValues[id] = sourceValue;
                }
                break;

            case 'text':
                if (obj.source_option != -1 || obj.source_option_lc != -1) {
                    let timeStamp;
                    if (obj.source_option != -1) {
                        this.log.debug(
                            `Source Option 'last update' detected! ${obj.source_option} Generating DateString for ${
                                state.ts
                            } ${this.getTimeStamp(state.ts, obj.source_option)}`,
                        );
                        timeStamp = this.getTimeStamp(state.ts, obj.source_option);
                    }

                    if (obj.source_option_lc != -1) {
                        this.log.debug(
                            `Source Option 'last change' detected! ${obj.source_option_lc} Generating DateString for ${
                                state.lc
                            } ${this.getTimeStamp(state.lc, obj.source_option_lc)}`,
                        );
                        timeStamp = this.getTimeStamp(state.lc, obj.source_option_lc);
                    }
                    outputValues.values[id] = timeStamp;
                } else {
                    const checkDisplay = async method => {
                        switch (method) {
                            case 'auto':
                                switch (obj.source_type) {
                                    case 'boolean':
                                        checkDisplay('bool');
                                        break;

                                    case 'number':
                                        checkDisplay('');
                                        break;

                                    case 'string':
                                        checkDisplay('text');
                                        break;
                                }
                                break;

                            case 'text':
                                {
                                    // Linebreak Option
                                    let strOutput;
                                    if (obj.linebreak > 0 && state.val && state.val.toString().length > 0) {
                                        let splitOpt = new RegExp(
                                            `.{0,${obj.linebreak}}(?:\\s|$)|.{0,${obj.linebreak}}`,
                                            'g',
                                        );
                                        let splitted = state.val.toString().match(splitOpt);
                                        strOutput = splitted.join('<br>');
                                    } else {
                                        strOutput = state.val;
                                    }
                                    outputValues.values[id] = strOutput;
                                    sourceValue = strOutput;
                                }
                                break;

                            case 'bool':
                                outputValues.values[id] = sourceValue
                                    ? systemDictionary['on'][systemLang]
                                    : systemDictionary['off'][systemLang];
                                break;

                            case 'own_text':
                                outputValues.values[id] = obj.text;
                                break;

                            default:
                                // Threshold need to be positive
                                if (obj.threshold >= 0) {
                                    this.log.debug(`Threshold for: ${id} is: ${obj.threshold}`);

                                    // Check, if we have Subtractions for this value
                                    const subArray = obj.subtract;
                                    let subValue = 0;
                                    if (Array.isArray(subArray) && subArray.length > 0 && subArray[0] != -1) {
                                        subValue = subArray.reduce(
                                            (acc, idx) =>
                                                acc - rawValues[idx] * (globalConfig.datasources[idx].factor ?? 1),
                                            0,
                                        );
                                        this.log.debug(`Subtracted by: ${subArray.toString()}`);

                                        // Set the subtraction state
                                        await this.setStateChangedAsync(`calculation.elements.element_${id}.subtract`, {
                                            val: Number(sourceValue) + Number(subValue),
                                            ack: true,
                                        });
                                    }

                                    // Check, if we have Additions for this value
                                    const addArray = obj.add;
                                    let addValue = 0;
                                    if (Array.isArray(addArray) && addArray.length > 0 && addArray[0] != -1) {
                                        addValue = addArray.reduce(
                                            (acc, idx) =>
                                                acc + rawValues[idx] * (globalConfig.datasources[idx].factor ?? 1),
                                            0,
                                        );
                                        this.log.debug(`Added to Value: ${addArray.toString()}`);

                                        // Set the addition state
                                        await this.setStateChangedAsync(`calculation.elements.element_${id}.addition`, {
                                            val: Number(sourceValue) + Number(addValue),
                                            ack: true,
                                        });
                                    }

                                    let formatValue = Number(sourceValue) + Number(subValue) + Number(addValue);

                                    // Check if value is over threshold
                                    if (Math.abs(formatValue) >= obj.threshold) {
                                        // Convert Value to positive
                                        let cValue = obj.convert ? Math.abs(formatValue) : formatValue;
                                        // Calculation
                                        switch (obj.calculate_kw) {
                                            case 'calc':
                                            case true:
                                                // Convert to kW if set
                                                cValue = Math.round((cValue / 1000) * 100) / 100;
                                                outputValues.unit[id] = 'kW';
                                                break;
                                            case 'auto':
                                                if (Math.abs(cValue) >= 1000000000) {
                                                    outputValues.unit[id] = 'GW';
                                                    // Convert to GW if set
                                                    cValue = Math.round((cValue / 1000000000) * 100) / 100;
                                                } else if (Math.abs(cValue) >= 1000000) {
                                                    outputValues.unit[id] = 'MW';
                                                    // Convert to MW if set
                                                    cValue = Math.round((cValue / 1000000) * 100) / 100;
                                                } else if (Math.abs(cValue) >= 1000) {
                                                    outputValues.unit[id] = 'kW';
                                                    // Convert to kW if set
                                                    cValue = Math.round((cValue / 1000) * 100) / 100;
                                                } else {
                                                    outputValues.unit[id] = 'W';
                                                }
                                                break;
                                            case 'none':
                                            case false:
                                                outputValues.unit[id] = '';
                                                break;
                                            default:
                                                return cValue;
                                        }

                                        outputValues.values[id] =
                                            obj.decimal_places >= 0
                                                ? this.decimalPlaces(cValue, obj.decimal_places)
                                                : cValue;
                                    } else {
                                        outputValues.values[id] =
                                            obj.decimal_places >= 0
                                                ? this.decimalPlaces(0, obj.decimal_places)
                                                : sourceValue;
                                    }
                                }
                                break;
                        }
                    };

                    checkDisplay(obj.source_display);
                }
                break;
        }

        // Overrides for elements
        if (obj.override) {
            this.log.debug(
                `Gathering override for ID: ${id}, Processed value: ${sourceValue}, Raw value: ${
                    rawValues[obj.source]
                }, Override: ${JSON.stringify(obj.override)}`,
            );
            outputValues.override[id] = await this.getOverridesAsync(sourceValue, obj.override);
        }
    }

    /**
     * Converts a duration in milliseconds to a human-readable time string.
     *
     * @param duration - The duration in milliseconds.
     * @returns The human-readable time string.
     */
    msToTime(duration) {
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        let value = systemDictionary['timer_now'][systemLang];

        if (hours > 0) {
            if (hours < 5 && hours >= 2) {
                value = systemDictionary['timer_few_hours'][systemLang];
            } else if (hours == 1) {
                value = this.sprintf(systemDictionary['timer_hour_ago'][systemLang], hours);
            } else {
                value = this.sprintf(systemDictionary['timer_hours_ago'][systemLang], hours);
            }
            return value;
        }

        if (minutes > 0) {
            if (minutes < 5 && minutes >= 2) {
                value = systemDictionary['timer_few_minutes'][systemLang];
            } else if (minutes == 1) {
                value = this.sprintf(systemDictionary['timer_minute_ago'][systemLang], minutes);
            } else {
                value = this.sprintf(systemDictionary['timer_minutes_ago'][systemLang], minutes);
            }
            return value;
        }

        if (seconds > 0) {
            if (seconds < 5 && seconds >= 2) {
                value = systemDictionary['timer_few_seconds'][systemLang];
            } else if (seconds == 1) {
                value = this.sprintf(systemDictionary['timer_second_ago'][systemLang], seconds);
            } else {
                value = this.sprintf(systemDictionary['timer_seconds_ago'][systemLang], seconds);
            }
        }

        return value;
    }

    /**
     * Replaces occurrences of `%s` in the given format string with the corresponding
     * elements from the arguments array.
     *
     * @param format - The format string with `%s` placeholders.
     * @returns The formatted string with placeholders replaced by the corresponding values.
     */
    sprintf(format) {
        var args = Array.prototype.slice.call(arguments, 1);
        var i = 0;
        return format.replace(/%s/g, function () {
            return args[i++];
        });
    }

    /**
     * Returns a formatted timestamp based on the given mode.
     *
     * @param ts - The timestamp in milliseconds.
     * @param mode - The mode to determine the format of the timestamp.
     * @returns The formatted timestamp.
     */

    getTimeStamp(ts, mode) {
        if (!ts || ts <= 0) {
            return '';
        }
        const date = new Date(ts);

        switch (mode) {
            case 'timestamp_de':
            default:
                return date.toLocaleString('de-DE', {
                    hour: 'numeric',
                    minute: 'numeric',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    second: '2-digit',
                    hour12: false,
                });
            case 'timestamp_de_short':
                return date.toLocaleString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour12: false,
                });
            case 'timestamp_de_short_wo_year':
                return date.toLocaleString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    hour12: false,
                });
            case 'timestamp_de_hhmm':
                return date.toLocaleString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                });
            case 'timestamp_us':
                return date.toLocaleString('en-US', {
                    hour: 'numeric',
                    minute: 'numeric',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    second: '2-digit',
                    hour12: true,
                });
            case 'timestamp_us_short':
                return date.toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour12: true,
                });
            case 'timestamp_us_short_wo_year':
                return date.toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    hour12: true,
                });
            case 'timestamp_us_hhmm':
                return date.toLocaleString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                });
            case 'relative': {
                const now = new Date();
                return this.msToTime(now - date);
            }
            case 'ms':
                return ts;
        }
    }

    /**
     * Converts a given timestamp into a formatted date and time string.
     *
     * @param ts - The timestamp in milliseconds.
     * @returns A string representing the date and time in the format "DD.MM.YYYY HH:MM:SS",
     *          or an empty string if the timestamp is invalid or non-positive.
     */
    getDateTime(ts) {
        if (!ts || ts <= 0) {
            return '';
        }

        const date = new Date(ts);

        const pad = n => n.toString().padStart(2, '0'); // Hilfsfunktion für führende Nullen

        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());

        return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Maps a given object of source-objects to their corresponding relative times.
     *
     * @param obj	An object with the following structure:
     * 					- Each key is the name of the object which is to be created.
     * 					- Each value is an object with the following structure:
     * 						- source: The source object to use.
     * 						- option: The option to use when generating the timestamp. If -1, the value is not used.
     * 							(See getTimeStamp for possible values)
     * 						- option_lc: The option to use when generating the timestamp from the last change. If -1, the value is not used.
     * 							(See getTimeStamp for possible values)
     * @returns A Promise which resolves when all objects have been processed.
     */
    async getRelativeTimeObjects(obj) {
        const keys = Object.keys(obj);
        const promises = keys.map(async key => {
            const stateValue = await this.getForeignStateAsync(obj[key].source);
            if (stateValue) {
                let timeStamp;

                if (obj[key].option != -1) {
                    timeStamp = this.getTimeStamp(stateValue.ts, obj[key].option);
                }

                if (obj[key].option_lc != -1) {
                    timeStamp = this.getTimeStamp(stateValue.lc, obj[key].option_lc);
                }

                outputValues.values[key] = timeStamp;
            }
        });

        await Promise.all(promises);
    }

    /**
     * Returns the given value as a string, rounded to the specified number of decimal places.
     *
     * @param value - The value to round.
     * @param decimal_places - The number of decimal places to round to.
     * @returns The rounded value as a string.
     */
    decimalPlaces(value, decimal_places) {
        return Number(value).toFixed(decimal_places);
    }

    /**
     * Calculates the duration (in ms) that a power meter animation should run based on the maximum duration, maximum power, and current power.
     * The result is limited to 60000 (1 minute) if necessary.
     *
     * @param maxDuration - The maximum duration of the animation in ms.
     * @param maxPower - The maximum power of the power meter.
     * @param currentPower - The current power of the power meter.
     * @returns The duration of the animation in ms.
     */
    calculateDuration(maxDuration, maxPower, currentPower) {
        // Max Duration
        const cur = Number(currentPower);
        const max = Number(maxPower);
        const dur = Number(maxDuration);

        // Calculate the result and limit it to 60000 if necessary
        return Math.min(Math.round((max / cur) * dur), 60000);
    }

    calculateStrokeDots(maxDots, maxPower, currentPower) {
        // Calculate the number of dots to be drawn
        const amount = Math.round((currentPower / maxPower) * maxDots);
        return Math.min(amount, maxDots);
    }

    async replacePlaceholders(value) {
        //const dpRegex = /\{([^{}]+\.[^{}]+\.[^{}]+)\}/g; /* Old Regex without number */
        const dpRegex = /\{([^{}]*\.\d+\.[^{}]+)\}/g;
        const matches = [...value.matchAll(dpRegex)];

        for (const match of matches) {
            this.log.debug(`Trying to receive: ${match[1]}`);
            const state = await this.getForeignStateAsync(match[1]);
            this.log.debug(`Received: ${JSON.stringify(state)} via ${match[1]}`);
            // State found
            if (state) {
                value = value.replace(match[0], state.val);
            } else {
                return {
                    status: false,
                    error: `Error: State <b>${match[1]}</b> not found!`,
                    function: value,
                };
            }
        }

        return value;
    }

    evaluateConditions(workObj, condValue) {
        // Property not found. We need to check the values!
        const operators = new RegExp('[=><!]');
        const sortedKeys = Object.keys(workObj).sort((a, b) => {
            const parse = s => {
                const match = s.match(/^([<>]=?|!?=)?\s*(-?\d+(\.\d+)?)/);
                if (!match) {
                    return { op: '', val: 0 };
                }
                return { op: match[1] || '', val: parseFloat(match[2]) };
            };
            const A = parse(a);
            const B = parse(b);

            if (A.op.startsWith('>')) {
                return B.val - A.val;
            }

            if (A.op.startsWith('<')) {
                return A.val - B.val;
            }
            return 0;
        });

        // Numeric condValue
        const isNumeric = !isNaN(condValue);
        const errorFunc = 'No function executed!';
        const errorWiki =
            'Visit the <a href="https://www.kreyenborg.koeln/wissensdatenbank/ueberschreibungen/" target="_blank">Wiki</a> for help!';

        for (const item of sortedKeys) {
            // Pre-Check for condition set
            if (typeof workObj[item] != 'object') {
                // Check, if condition set is not an object
                return {
                    error: {
                        status: false,
                        error: `You need to provide an object with overrides for this condition to work! ${errorWiki}`,
                        function: errorFunc,
                    },
                };
            }

            if (typeof workObj[item] == 'object' && Object.keys(workObj[item]).length == 0) {
                // Check, if condition set is an object and not empty
                return {
                    error: {
                        status: false,
                        error: `The provided set of overrides is empty! ${errorWiki}`,
                        function: errorFunc,
                    },
                };
            }

            // Now, we need to check, if condValue is a number and we have an operator
            if (operators.test(item) && isNumeric) {
                // Operator found - check for condition
                try {
                    const func = Function(`return ${condValue}${item} `)();
                    if (func) {
                        return workObj[item];
                    }
                } catch (func) {
                    return {
                        error: {
                            status: false,
                            error: func.toString(),
                            function: condValue + item,
                        },
                    };
                }
            } else if (item == condValue) {
                // No Operator found - Check for property
                return workObj[item];
            }
        }

        // Still no return - check for default value
        if ('default' in workObj) {
            return workObj['default'];
        }

        // Return empty
        return {};
    }

    async getOverridesAsync(condValue, obj) {
        let workObj;
        try {
            workObj = typeof obj === 'string' ? JSON.parse(obj) : JSON.parse(JSON.stringify(obj));
        } catch {
            return {};
        }

        // Generate object for conditions
        const tmpWorker = this.evaluateConditions(workObj, condValue);

        // Now we process the found values inside tmpWorker Obj
        if (Object.keys(tmpWorker).length > 0) {
            for (const item of Object.keys(tmpWorker)) {
                // Temp Storage of workerValue
                let itemToWorkWith = tmpWorker[item];

                // Check if we are not destroying the error object
                if (typeof itemToWorkWith != 'object') {
                    itemToWorkWith = itemToWorkWith.toString();
                    const replacedItems = await this.replacePlaceholders(itemToWorkWith);
                    if (replacedItems?.status === false) {
                        tmpWorker[item] = replacedItems;
                        break;
                    } else {
                        this.log.debug(`Running function: ${itemToWorkWith}`);
                        itemToWorkWith = replacedItems;

                        try {
                            const func = new Function(`return ${itemToWorkWith} `)();
                            tmpWorker[item] = func(condValue);
                            this.log.debug(`Result of the function: ${tmpWorker[item]}`);

                            // Check, if we have an undefined result
                            if (typeof tmpWorker[item] == 'undefined') {
                                tmpWorker[item] = {
                                    status: false,
                                    error: 'Your function returned <b>undefined</b>! Did you use a return statement? Example: <code>return someValue;</code>',
                                    function: itemToWorkWith,
                                };
                            }
                        } catch (func) {
                            // Test for incomplete function
                            const hasBraces = /\{\s*[^{}]*\s*\}/;
                            const hasArrow = /=>/;

                            if (hasBraces.test(itemToWorkWith) && !hasArrow.test(itemToWorkWith)) {
                                this.log.debug(`Error of the function: ${func.toString()}`);
                                tmpWorker[item] = {
                                    status: false,
                                    error: 'You can not run a function block directly! You need to open a function block with an anonymous function first! <code>Example: () => {}</code>',
                                    function: itemToWorkWith,
                                };
                            } else if (hasArrow.test(itemToWorkWith)) {
                                this.log.debug(`Error of the function: ${func.toString()}`);
                                tmpWorker[item] = {
                                    status: false,
                                    error: func.toString(),
                                    function: itemToWorkWith,
                                };
                            } else {
                                tmpWorker[item] = itemToWorkWith;
                            }
                        }
                    }
                }
            }
        }

        return tmpWorker;
    }

    /**
     * @param id	ID of the state
     * @param state	State itself
     */
    async refreshData(id, state) {
        if (id == `${this.namespace}.configuration`) {
            this.log.info('Configuration changed via Workspace! Reloading config!');
            this.getConfig();
            return;
        }

        let cssRules = [];

        // Check, if we handle this source inside our subscribtion
        if (Object.hasOwn(sourceObject, id)) {
            // sourceObject for this state-id
            const soObj = sourceObject[id];

            // Number for calculation
            const stateValue = state.val;
            // prettier-ignore
            const factor = globalConfig?.datasources && Object.hasOwn(globalConfig.datasources, soObj.id)
                ? (globalConfig.datasources[soObj.id].factor ?? 1)
                : 1;

            const calcNumber =
                (typeof state.val === 'string' ? Number(state.val.replace(/[^\d.-]/g, '')) : state.val) * factor;

            // Check, if the value has been updated - if not, dont refresh it
            this.log.debug(`Current Value of ${id}: ${stateValue} - saved Value: ${rawValues[soObj.id]}`);
            if (stateValue == rawValues[soObj.id]) {
                this.log.debug(`Value of ${id} did not change. Ignoring!`);
                return;
            }

            this.log.debug(
                `Value of ${id} changed! Old Value: ${rawValues[soObj.id]} | New Value: ${stateValue} Processing!`,
            );

            // Put Value into RAW-Source-Values
            rawValues[soObj.id] = stateValue;

            // Runner for calculating the values
            const sourceRunner = async what => {
                this.log.debug(`Updated through ${what}: ${JSON.stringify(rawValues)}`);

                // Run through the provided object
                for (const key of Object.keys(soObj[what])) {
                    const elmID = soObj[what][key];

                    if (what == 'elmSources') {
                        // Put ID into CSS-Rule for later use
                        cssRules.push(elmID);
                    }

                    if (Object.hasOwn(settingsObj, elmID)) {
                        this.log.debug(`Value-Settings for Element ${elmID} found! Applying Settings!`);
                        await this.calculateValue(elmID, settingsObj[elmID], state);
                    }
                }
            };

            // Loop through each addSource
            if (Object.hasOwn(soObj, 'addSources') && soObj['addSources'].length) {
                await sourceRunner('addSources');
            }

            // Loop through each subtractSource
            if (Object.hasOwn(soObj, 'subtractSources') && soObj['subtractSources'].length) {
                await sourceRunner('subtractSources');
            }

            // Loop through each Element, which belongs to that source
            if (Object.hasOwn(soObj, 'elmSources') && soObj['elmSources'].length) {
                await sourceRunner('elmSources');
            }

            // Check, if that Source belongs to battery-charge or discharge, to determine the time
            if (Object.hasOwn(globalConfig, 'calculation')) {
                // Check, if the provided source is a valid source
                const isValidDatasource = value => {
                    if (value === null || value === undefined || value === '') {
                        return false;
                    }

                    // Check, if value is type 'number'
                    if (typeof value !== 'number') {
                        return false;
                    }

                    // Check, if value is greater than or equal 0 ist
                    return !isNaN(value) && Number(value) >= 0;
                };

                // Battery Remaining
                if (Object.hasOwn(globalConfig.calculation, 'battery')) {
                    const batObj = globalConfig.calculation.battery;
                    const isRelevantId = soObj.id == batObj.charge || soObj.id == batObj.discharge;

                    if (
                        isRelevantId &&
                        isValidDatasource(batObj.charge) &&
                        isValidDatasource(batObj.discharge) &&
                        isValidDatasource(batObj.percent)
                    ) {
                        let direction = 'none';
                        let energy = 0;

                        const batteryValue = Math.abs(calcNumber);

                        const setDirectionAndEnergy = (dir, en) => {
                            direction = dir;
                            energy = en;
                        };

                        if (batObj.charge !== batObj.discharge) {
                            if (soObj.id === batObj.charge) {
                                setDirectionAndEnergy('charge', batteryValue);
                            }
                            if (soObj.id === batObj.discharge) {
                                setDirectionAndEnergy('discharge', batteryValue);
                            }
                        } else {
                            if (calcNumber > 0) {
                                if (!batObj.charge_prop) {
                                    setDirectionAndEnergy('charge', batteryValue);
                                }
                                if (!batObj.discharge_prop) {
                                    setDirectionAndEnergy('discharge', batteryValue);
                                }
                            } else if (calcNumber < 0) {
                                if (batObj.charge_prop) {
                                    setDirectionAndEnergy('charge', batteryValue);
                                }
                                if (batObj.discharge_prop) {
                                    setDirectionAndEnergy('discharge', batteryValue);
                                }
                            }
                        }

                        // Calculate the rest time of the battery
                        this.getForeignStateAsync(globalConfig.datasources[batObj.percent].source)
                            .then(state => {
                                const capacity = isValidDatasource(batObj.capacity)
                                    ? rawValues[batObj.capacity] *
                                      (globalConfig.datasources[batObj.capacity].factor ?? 1)
                                    : 0;
                                const dod = isValidDatasource(batObj.dod)
                                    ? rawValues[batObj.dod] * (globalConfig.datasources[batObj.dod].factor ?? 1)
                                    : 0;
                                const percent = state.val;

                                let rest = 0;
                                let mins = 0;
                                let string = '--:--h';
                                let target = 0;
                                const batt_energy = (capacity * (percent - dod)) / 100 || 0;

                                if (percent > 0 && energy > 0) {
                                    if (direction === 'charge') {
                                        rest = capacity - (capacity * percent) / 100;
                                    } else if (direction === 'discharge') {
                                        rest = (capacity * (percent - dod)) / 100;
                                    }

                                    mins = Math.round((rest / energy) * 60);
                                    if (mins > 0) {
                                        string = `${this.getMinHours(mins)}h`;
                                        target = Math.floor(Date.now() / 1000) + mins * 60;
                                    }
                                }

                                this.log.debug(
                                    `Direction: ${direction} Time to fully ${direction}: ${target} Percent: ${percent} Energy: ${energy} Rest Energy to ${direction}: ${rest} DoD: ${dod}`,
                                );

                                // Set the states
                                this.setStateChangedAsync('calculation.battery.remaining_energy', {
                                    val: batt_energy,
                                    ack: true,
                                });
                                this.setStateChangedAsync('calculation.battery.remaining', {
                                    val: string,
                                    ack: true,
                                });
                                this.setStateChangedAsync('calculation.battery.remaining_target', {
                                    val: target,
                                    ack: true,
                                });
                                this.setStateChangedAsync('calculation.battery.remaining_target_DT', {
                                    val: this.getDateTime(target * 1000),
                                    ack: true,
                                });
                            })
                            .catch(e => {
                                this.log.warn(`Calculation for battery-remaining failed! Error: ${e}`);
                            });
                    }
                }

                // Consumption calculation
                if (Object.hasOwn(globalConfig.calculation, 'consumption')) {
                    const consObj = globalConfig.calculation.consumption;
                    const { gridFeed, gridConsume, batteryCharge, batteryDischarge, production } = consObj;
                    const isRelevantId =
                        soObj.id == gridFeed ||
                        soObj.id == gridConsume ||
                        soObj.id == batteryCharge ||
                        soObj.id == batteryDischarge ||
                        production.includes(soObj.id);

                    if (isRelevantId && production.indexOf(-1) !== 0) {
                        this.log.debug('Calculation for consumption should be possible!');

                        // Calc all Production states
                        const prodArray = consObj.production;
                        let prodValue = 0;

                        this.log.debug(
                            `[Calculation] Datasources GridFeed: ${consObj.gridFeed}, GridConsume: ${consObj.gridConsume} | Optional: BatteryCharge: ${consObj.batteryCharge}, BatteryDischarge: ${consObj.batteryDischarge}`,
                        );
                        this.log.debug(
                            `[Calculation] RAW-Values GridFeed: ${rawValues[consObj.gridFeed]}, GridConsume: ${Math.abs(
                                rawValues[consObj.gridConsume],
                            )} | Optional: BatteryCharge: ${
                                rawValues[consObj.batteryCharge]
                            }, BatteryDischarge: ${Math.abs(rawValues[consObj.batteryDischarge])}`,
                        );

                        // Grid
                        const gridFeed = isValidDatasource(consObj.gridFeed)
                            ? rawValues[consObj.gridFeed] * (globalConfig.datasources[consObj.gridFeed].factor ?? 1)
                            : 0;
                        const gridConsume = isValidDatasource(consObj.gridConsume)
                            ? Math.abs(
                                  rawValues[consObj.gridConsume] *
                                      (globalConfig.datasources[consObj.gridConsume].factor ?? 1),
                              )
                            : 0;

                        // Battery
                        const batteryCharge = isValidDatasource(consObj.batteryCharge)
                            ? rawValues[consObj.batteryCharge] *
                              (globalConfig.datasources[consObj.batteryCharge].factor ?? 1)
                            : 0;
                        const batteryDischarge = isValidDatasource(consObj.batteryDischarge)
                            ? Math.abs(
                                  rawValues[consObj.batteryDischarge] *
                                      (globalConfig.datasources[consObj.batteryDischarge].factor ?? 1),
                              )
                            : 0;

                        this.log.debug(
                            `[Calculation] Consumption. GridFeed: ${gridFeed}, GridConsume: ${gridConsume} | Optional: BatteryCharge: ${batteryCharge}, BatteryDischarge: ${batteryDischarge}`,
                        );

                        // Consumption
                        let consumption = 0;

                        // Battery Charge - via Grid or Solar
                        let battChargeGrid = 0;
                        let battChargeSolar = 0;

                        // Production state(s)
                        prodValue = prodArray.reduce(
                            (sum, id) =>
                                sum +
                                (id !== -1 ? Math.abs(rawValues[id] * (globalConfig.datasources[id].factor ?? 1)) : 0),
                            0,
                        );

                        // Write production to state
                        this.setStateChangedAsync('calculation.production.production', {
                            val: prodValue,
                            ack: true,
                        });

                        // Calculate Production
                        consumption = prodValue;

                        // Subtract or add grid - different States
                        if (consObj.gridFeed != consObj.gridConsume) {
                            // Feed-In - Subtract
                            if (Math.abs(gridFeed) > gridConsume) {
                                consumption -= Math.abs(gridFeed);
                            }

                            // Feed-Consumption - Add
                            if (Math.abs(gridFeed) < gridConsume) {
                                consumption += gridConsume;
                            }
                        }

                        // Subtract or add grid - same States
                        if (consObj.gridFeed == consObj.gridConsume) {
                            if (gridFeed > 0) {
                                if (!consObj.gridFeed_prop) {
                                    consumption -= Math.abs(gridFeed);
                                }
                                if (!consObj.gridConsume_prop) {
                                    consumption += gridConsume;
                                }
                            }
                            // Consuming from grid
                            if (gridFeed < 0) {
                                if (consObj.gridFeed_prop) {
                                    consumption -= Math.abs(gridFeed);
                                }
                                if (consObj.gridConsume_prop) {
                                    consumption += gridConsume;
                                }
                            }
                        }

                        // Subtract or add battery
                        if (consObj.batteryCharge != consObj.batteryDischarge) {
                            const chargeValue = Math.abs(batteryCharge);
                            // Charge - Subtract
                            if (chargeValue > batteryDischarge) {
                                consumption -= chargeValue;

                                // Battery Charge - via Grid or Solar
                                battChargeGrid = prodValue < chargeValue ? chargeValue : 0;
                                battChargeSolar = prodValue > chargeValue ? chargeValue : 0;
                            }

                            // Discharge - Add
                            if (chargeValue < batteryDischarge) {
                                consumption += batteryDischarge;
                            }
                        }

                        // Subtract or add battery - same States
                        if (consObj.batteryCharge == consObj.batteryDischarge) {
                            if (batteryCharge > 0) {
                                const chargeValue = Math.abs(batteryCharge);
                                if (!consObj.batteryCharge_prop) {
                                    consumption -= chargeValue;

                                    // Battery Charge - via Grid or Solar
                                    battChargeGrid = prodValue < chargeValue ? chargeValue : 0;
                                    battChargeSolar = prodValue > chargeValue ? chargeValue : 0;
                                }
                                if (!consObj.batteryDischarge_prop) {
                                    consumption += batteryDischarge;
                                }
                            }

                            if (batteryCharge < 0) {
                                const chargeValue = Math.abs(batteryCharge);
                                if (consObj.batteryCharge_prop) {
                                    consumption -= chargeValue;

                                    // Battery Charge - via Grid or Solar
                                    battChargeGrid = prodValue < chargeValue ? chargeValue : 0;
                                    battChargeSolar = prodValue > chargeValue ? chargeValue : 0;
                                }
                                if (consObj.batteryDischarge_prop) {
                                    consumption += batteryDischarge;
                                }
                            }
                        }

                        // Battery Charge
                        this.log.debug(
                            `Battery Charging.Grid: ${battChargeGrid} | Solar: ${battChargeSolar}. ID: ${soObj.id} `,
                        );

                        // Write battery to state
                        this.setStateChangedAsync('calculation.battery.charging_grid', {
                            val: battChargeGrid,
                            ack: true,
                        });
                        this.setStateChangedAsync('calculation.battery.charging_solar', {
                            val: battChargeSolar,
                            ack: true,
                        });

                        // Debug Log
                        this.log.debug(
                            `Current Values for calculation of consumption: Production: ${prodValue}, Battery: ${batteryCharge} / ${batteryDischarge} , Grid: ${gridFeed} / ${gridConsume} - Consumption: ${consumption} `,
                        );

                        // Write consumption to state
                        this.setStateChangedAsync('calculation.consumption.consumption', {
                            val: consumption,
                            ack: true,
                        });
                    }
                }
            }

            // Animations
            if (Object.hasOwn(soObj, 'elmAnimations')) {
                this.log.debug(`Found corresponding animations for ID: ${id} ! Applying!`);
                for (const _key of Object.keys(soObj.elmAnimations)) {
                    const src = soObj.elmAnimations[_key];

                    // Object Variables
                    let tmpType, tmpDots, tmpDuration, tmpOption;

                    // Put ID into CSS-Rule for later use
                    cssRules.push(src);

                    let tmpAnimValid = true;

                    // Animations
                    if (Object.hasOwn(settingsObj, src)) {
                        this.log.debug(`Animation - Settings for Element ${src} found! Applying Settings!`);
                        const seObj = settingsObj[src];

                        if (seObj.type != -1 && seObj != undefined) {
                            if (seObj.type == 'dots') {
                                tmpType = 'dots';
                                tmpDots = this.calculateStrokeDots(seObj.dots, seObj.power, Math.abs(calcNumber));
                            }
                            if (seObj.type == 'duration') {
                                tmpType = 'duration';
                                tmpDuration = this.calculateDuration(seObj.duration, seObj.power, Math.abs(calcNumber));
                            }
                        }

                        const handleAnimation = (thresholdCheck, option) => {
                            if (thresholdCheck) {
                                this.log.debug(
                                    `Value: ${calcNumber} is greater than Threshold: ${seObj.threshold}. Applying Animation!`,
                                );
                                tmpAnimValid = true;
                                tmpOption = option;
                            } else {
                                this.log.debug(
                                    `Value: ${calcNumber} is smaller than Threshold: ${seObj.threshold}. Deactivating Animation!`,
                                );
                                tmpAnimValid = false;
                            }
                        };

                        switch (seObj.properties) {
                            case 'positive':
                                this.log.debug('Animation has a positive factor!');
                                handleAnimation(calcNumber > 0 && calcNumber >= seObj.threshold, '');
                                if (!tmpAnimValid && seObj.option && calcNumber <= -seObj.threshold) {
                                    tmpAnimValid = true;
                                    tmpOption = 'reverse';
                                }
                                break;
                            case 'negative':
                                this.log.debug('Animation has a negative factor!');
                                handleAnimation(calcNumber < 0 && calcNumber <= -seObj.threshold, '');
                                if (!tmpAnimValid && seObj.option && calcNumber >= seObj.threshold) {
                                    tmpAnimValid = true;
                                    tmpOption = 'reverse';
                                }
                                break;
                        }

                        // Set Animation
                        outputValues.animations[src] = {
                            animation: tmpAnimValid,
                            type: tmpType,
                            duration: tmpDuration,
                            dots: tmpDots,
                            option: tmpOption,
                        };

                        // Overrides for Animations
                        if (seObj.override) {
                            outputValues.override[src] = await this.getOverridesAsync(calcNumber, seObj.override);
                            this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[src])} `);
                        }

                        // Overrides for Lines
                        let line_id = src.replace('anim', 'line');
                        if (Object.hasOwn(settingsObj, line_id)) {
                            outputValues.override[line_id] = await this.getOverridesAsync(
                                calcNumber,
                                settingsObj[line_id].override,
                            );
                            this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[line_id])} `);
                        }
                    }
                }
            }

            // Put CSS together
            if (cssRules.length > 0) {
                cssRules.forEach(src => {
                    const seObj = settingsObj[src];
                    let tmpCssRules = {};

                    const updateTmpCssRules = (posActive, posInactive, negActive, negInactive) => {
                        tmpCssRules.actPos = posActive;
                        tmpCssRules.inactPos = posInactive;
                        tmpCssRules.actNeg = negActive;
                        tmpCssRules.inactNeg = negInactive;
                    };

                    // CSS Rules
                    if (seObj.source_type == 'boolean') {
                        this.log.debug(`Setting for boolean ${JSON.stringify(seObj)} and ID: ${src} `);
                        if (calcNumber === 1) {
                            updateTmpCssRules(seObj.css_active_positive, seObj.css_inactive_positive);
                        } else if (calcNumber === 0) {
                            updateTmpCssRules(seObj.css_inactive_positive, seObj.css_active_positive);
                        }
                    } else {
                        if (seObj.threshold >= 0) {
                            if (Math.abs(calcNumber) > seObj.threshold) {
                                // CSS Rules
                                if (calcNumber > 0) {
                                    // CSS Rules - Positive
                                    updateTmpCssRules(
                                        seObj.css_active_positive,
                                        seObj.css_inactive_positive,
                                        undefined,
                                        seObj.css_active_negative,
                                    );
                                }
                                if (calcNumber < 0) {
                                    // CSS Rules - Negative
                                    updateTmpCssRules(
                                        undefined,
                                        seObj.css_active_positive,
                                        seObj.css_active_negative,
                                        seObj.css_inactive_negative,
                                    );
                                }
                            } else {
                                // CSS Rules
                                if (calcNumber > 0) {
                                    // CSS Rules - Positive
                                    updateTmpCssRules(
                                        seObj.css_inactive_positive,
                                        seObj.css_active_positive,
                                        undefined,
                                        seObj.css_active_negative,
                                    );
                                }
                                if (calcNumber < 0) {
                                    // CSS Rules - Negative
                                    updateTmpCssRules(
                                        undefined,
                                        seObj.css_active_positive,
                                        seObj.css_inactive_negative,
                                        seObj.css_active_negative,
                                    );
                                }
                                if (calcNumber == 0) {
                                    // CSS Rules - Positive
                                    // Inactive Positive
                                    let inactPos = seObj.css_active_positive
                                        ? `${seObj.css_active_positive} `
                                        : undefined;
                                    inactPos = seObj.css_inactive_positive
                                        ? inactPos + seObj.css_inactive_positive
                                        : inactPos;

                                    // Inactive Negative
                                    let inactNeg = seObj.css_active_negative
                                        ? `${seObj.css_active_negative} `
                                        : undefined;
                                    inactNeg = seObj.css_inactive_negative
                                        ? inactNeg + seObj.css_inactive_negative
                                        : inactNeg;
                                    updateTmpCssRules(undefined, inactPos, undefined, inactNeg);
                                }
                            }
                        }
                    }
                    // Add to Output
                    tmpCssRules = Object.fromEntries(Object.entries(tmpCssRules).filter(([_, v]) => v !== undefined));

                    if (Object.keys(tmpCssRules).length > 0) {
                        outputValues.css[src] = tmpCssRules;
                    }
                });
            }

            this.log.debug(
                `State changed! New value for Source: ${id} with Value: ${stateValue} belongs to Elements: ${soObj.elmSources.toString()} `,
            );

            // Build Output
            this.setStateChangedAsync('data', {
                val: JSON.stringify(outputValues),
                ack: true,
            });
        } else {
            this.log.warn(
                `State changed! New value for Source: ${id} belongs to Elements, which were not found! Please check them!`,
            );
        }
    }

    /**
     * Retrieves the configuration data, processes it, and sets up necessary subscriptions and objects for further operations.
     *
     * @returns Promise that resolves once the configuration setup is complete.
     */
    async getConfig() {
        // Unsubscribe from all states to avoid errors
        await this.unsubscribeForeignStatesAsync(subscribeArray);
        subscribeArray = [];

        // Reset the Arrays/Objects
        globalConfig = {};
        outputValues = {
            values: {},
            unit: {},
            animations: {},
            fillValues: {},
            borderValues: {},
            prepend: {},
            append: {},
            css: {},
            override: {},
            img_href: {},
        };
        rawValues = {};
        sourceObject = {};
        settingsObj = {};
        relativeTimeCheck = {};

        // Put own DP
        subscribeArray.push(`${this.namespace}.configuration`);

        // Read configuration DataPoint
        const tmpConfig = await this.getStateAsync('configuration');
        try {
            globalConfig = JSON.parse(tmpConfig.val);
        } catch {
            this.log.warn('This is the first time the adapter starts. Setting config to default (empty)!');
            globalConfig = {};
        }
        this.log.debug(JSON.stringify(globalConfig));

        // Collect all Datasources
        if (Object.hasOwn(globalConfig, 'datasources')) {
            for (const key of Object.keys(globalConfig.datasources)) {
                const value = globalConfig.datasources[key];
                this.log.debug(`Datasource: ${JSON.stringify(value)} `);
                if (value.source != '' && Object.hasOwn(value, 'source')) {
                    try {
                        const stateValue = await this.getForeignStateAsync(value.source);
                        if (stateValue) {
                            // Create sourceObject, for handling sources
                            sourceObject[value.source] = {
                                id: parseInt(key),
                                elmSources: [],
                                elmAnimations: [],
                                addSources: [],
                                subtractSources: [],
                            };

                            // Add to SubscribeArray
                            subscribeArray.push(value.source);
                        } else {
                            this.log.warn(
                                `The adapter could not find the state '${value.source}' used as datasource! Please review your configuration of the adapter!`,
                            );
                        }
                    } catch {
                        this.log.warn(
                            `The adapter could not request the state '${value.source}'! The state seems to be deleted! Please review your configuration of the adapter!`,
                        );
                    }
                }
            }
        }

        // Collect the Elements, which are using the sources
        if (Object.hasOwn(globalConfig, 'elements')) {
            // Check, if calculation elements are still present
            const elmIDs = Object.keys(globalConfig.elements);
            const calcStates = await this.getStatesAsync('calculation.elements.*');

            if (calcStates) {
                for (const key of Object.keys(calcStates)) {
                    const keyParts = key.split('.');
                    if (keyParts.length > 4) {
                        const calcStateParts = keyParts[4].split('_');
                        const calcState = calcStateParts[1];
                        if (elmIDs.includes(calcState)) {
                            this.log.info(`Calculation for ID ${calcState} is valid, as the element is still in use!`);
                        } else {
                            this.log.info(
                                `Calculation for ID ${calcState} is invalid, as the element does not exist anymore! Channel 'element_${calcState}' will be deleted!`,
                            );
                            await this.delObjectAsync(`calculation.elements.element_${calcState}`, { recursive: true });
                        }
                    }
                }
            }

            // Loop through elements and get their data
            for (const key of Object.keys(globalConfig.elements)) {
                const value = globalConfig.elements[key];
                // Normal sources via Datasources
                if (Object.hasOwn(value, 'source') && Object.hasOwn(globalConfig.datasources, value.source)) {
                    const gDataSource = globalConfig.datasources[value.source];
                    if (Object.hasOwn(sourceObject, gDataSource.source)) {
                        const objObject = await this.getForeignObjectAsync(gDataSource.source);
                        if (objObject) {
                            // Save Settings for each object
                            settingsObj[key] = {
                                threshold: value.threshold || 0,
                                calculate_kw: value.calculate_kw,
                                decimal_places: value.decimal_places,
                                convert: value.convert,
                                type: value.type,
                                source: value.source,
                                source_option: value.source_option || -1,
                                source_option_lc: value.source_option_lc || -1,
                                source_display: value.source_display,
                                subtract: value.subtract,
                                add: value.add,
                                css_general: value.css_general,
                                css_active_positive: value.css_active_positive,
                                css_inactive_positive: value.css_inactive_positive,
                                css_active_negative: value.css_active_negative,
                                css_inactive_negative: value.css_inactive_negative,
                                fill_type: value.fill_type,
                                border_type: value.border_type,
                                override: value.override,
                                source_type: objObject.common.type,
                                text: value.text,
                                linebreak: value.linebreak,
                            };

                            // Append and prepend
                            outputValues.append[key] = value.append;
                            outputValues.prepend[key] = value.prepend;

                            // Unit
                            outputValues.unit[key] = value.unit;

                            // Put into timer object for re-requesting
                            if (value.source_option == 'relative' || value.source_option_lc == 'relative') {
                                relativeTimeCheck[key] = {
                                    source: gDataSource.source,
                                    option: value.source_option || -1,
                                    option_lc: value.source_option_lc || -1,
                                };
                            }

                            // Put elment ID into Source
                            sourceObject[gDataSource.source].elmSources.push(parseInt(key));

                            // Create Channel for Element subtractions and additions
                            const addAvailable =
                                value.add && typeof value.add == 'object' && value.add.length > 0 && value.add[0] != -1;
                            const subAvailable =
                                value.subtract &&
                                typeof value.subtract == 'object' &&
                                value.subtract.length > 0 &&
                                value.subtract[0] != -1;
                            if (addAvailable || subAvailable) {
                                await this.setObjectNotExistsAsync(`calculation.elements.element_${key}`, {
                                    type: 'channel',
                                    common: {
                                        name: `Additions and Subtractions of element with ID ${key}`,
                                    },
                                    native: {},
                                });
                                this.log.debug(`Calculation channel for Element with ID ${key} created!`);
                            } else {
                                // Delete the state, if not used anymore
                                await this.delObjectAsync(`calculation.elements.element_${key}`, { recursive: true });
                                this.log.debug(`Calculation channel for Element with ID ${key} deleted!`);
                            }

                            // Put addition ID's into addition array
                            if (value.add && typeof value.add === 'object') {
                                const addArray = value.add;
                                if (addArray.length > 0) {
                                    // Create a state for Addition for this element
                                    if (addArray[0] != -1) {
                                        await this.setObjectNotExistsAsync(
                                            `calculation.elements.element_${key}.addition`,
                                            {
                                                type: 'state',
                                                common: {
                                                    name: `Additions of element with ID ${key}`,
                                                    type: 'number',
                                                    role: 'value.power',
                                                    read: true,
                                                    write: false,
                                                    def: 0,
                                                    unit: 'W',
                                                },
                                                native: {},
                                            },
                                        );
                                        this.log.debug(`Addition calculation for Element with ID ${key} created!`);
                                    }

                                    for (const add of addArray) {
                                        if (add !== -1) {
                                            const dataSource = globalConfig.datasources[add];
                                            if (Object.hasOwn(sourceObject, dataSource.source)) {
                                                sourceObject[dataSource.source].addSources.push(parseInt(key));
                                            } else {
                                                this.log.warn(
                                                    `The addition datasource with ID '${add}' which is used in element '${key}' of type ${value.type} was not found! Please review your configuration of the adapter!`,
                                                );
                                            }
                                        }
                                    }
                                }
                            }

                            // Put subtract ID's into subtraction array
                            if (value.subtract && typeof value.subtract === 'object') {
                                const subtractArray = value.subtract;
                                if (subtractArray.length > 0) {
                                    // Create a state for Addition for this element
                                    if (subtractArray[0] != -1) {
                                        await this.setObjectNotExistsAsync(
                                            `calculation.elements.element_${key}.subtract`,
                                            {
                                                type: 'state',
                                                common: {
                                                    name: `Subtractions of element with ID ${key}`,
                                                    type: 'number',
                                                    role: 'value.power',
                                                    read: true,
                                                    write: false,
                                                    def: 0,
                                                    unit: 'W',
                                                },
                                                native: {},
                                            },
                                        );
                                        this.log.debug(`Subtraction calculation for Element with ID ${key} created!`);
                                    }

                                    for (const subtract of subtractArray) {
                                        if (subtract !== -1) {
                                            const dataSource = globalConfig.datasources[subtract];
                                            if (Object.hasOwn(sourceObject, dataSource.source)) {
                                                sourceObject[dataSource.source].subtractSources.push(parseInt(key));
                                            } else {
                                                this.log.warn(
                                                    `The subtraction datasource with ID '${subtract}' which is used in element '${key}' of type ${value.type} was not found! Please review your configuration of the adapter!`,
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        this.log.warn(
                            `State '${gDataSource.source}' which is used for element with ID ${key} of type ${value.type} is not available! Please review your configuration of the adapter!`,
                        );
                    }
                }

                // Datasources for image href
                if (value.href != undefined && value.href.length > 0) {
                    const dp_regex = new RegExp('{([^)]+)}');
                    let hrefString = value.href.match(dp_regex);
                    if (hrefString && hrefString.length > 0) {
                        this.log.debug(`Using datasource '${hrefString[1]}' as href for image with ID ${key} `);
                        const stateValue = await this.getForeignStateAsync(hrefString[1]);
                        if (stateValue) {
                            // Check, if we use it already inside elements
                            if (Object.hasOwn(settingsObj, key)) {
                                settingsObj[key].href = hrefString[1];
                            } else {
                                // Complete object for this
                                settingsObj[key] = {
                                    threshold: value.threshold || 0,
                                    href: hrefString[1],
                                    type: value.type,
                                    override: value.override,
                                    css_general: value.css_general,
                                    css_active_positive: value.css_active_positive,
                                    css_inactive_positive: value.css_inactive_positive,
                                    css_active_negative: value.css_active_negative,
                                    css_inactive_negative: value.css_inactive_negative,
                                };
                            }
                            this.log.debug(
                                `Href: ${value.href} Key: ${key} Object: ${JSON.stringify(settingsObj[key])}`,
                            );

                            // Create sourceObject, for handling sources
                            if (Object.hasOwn(sourceObject, hrefString[1])) {
                                sourceObject[hrefString[1]].elmSources.push(key);
                            } else {
                                sourceObject[hrefString[1]] = {
                                    id: hrefString[1],
                                    elmSources: [key],
                                };

                                // Add to SubscribeArray
                                subscribeArray.push(hrefString[1]);
                            }
                        } else {
                            this.log.warn(
                                `State '${hrefString[1]}' which is used for element with ID ${key} of type ${value.type} is not available! Please review your configuration of the adapter!`,
                            );
                        }
                    }
                }
            }
        }

        // Animations
        if (Object.hasOwn(globalConfig, 'animations')) {
            for (const key of Object.keys(globalConfig.animations)) {
                const value = globalConfig.animations[key];
                if (Object.hasOwn(value, 'source') && Object.hasOwn(globalConfig.datasources, value.source)) {
                    const gDataSource = globalConfig.datasources[value.source];
                    if (Object.hasOwn(sourceObject, gDataSource.source)) {
                        // Save Settings for each object
                        settingsObj[key] = {
                            properties: value.animation_properties,
                            option: value.animation_option,
                            threshold: value.threshold || 0,
                            type: value.animation_type,
                            duration: value.duration,
                            power: value.power,
                            dots: value.dots,
                            css_general: value.css_general,
                            css_active_positive: value.css_active_positive,
                            css_inactive_positive: value.css_inactive_positive,
                            css_active_negative: value.css_active_negative,
                            css_inactive_negative: value.css_inactive_negative,
                            override: value.override,
                        };

                        // Put Animation into Source
                        sourceObject[gDataSource.source].elmAnimations.push(key);

                        // Check, if corresponding line has override properties as well
                        let line_id = key.replace('anim', 'line');
                        if (Object.hasOwn(globalConfig.lines[line_id], 'override')) {
                            this.log.debug(`Found override for line ${line_id} in combination with Animation ${key} `);
                            settingsObj[line_id] = {
                                override: globalConfig.lines[line_id].override,
                            };
                        }
                    } else {
                        this.log.warn(
                            `State '${gDataSource.source}' which is used for element with ID ${key} of type ${value.type} is not available! Please review your configuration of the adapter!`,
                        );
                    }
                }
            }
        }

        this.log.debug(`Settings: ${JSON.stringify(settingsObj)} `);
        this.log.debug(`Initial Values: ${JSON.stringify(outputValues.values)} `);
        this.log.debug(`Initial Fill - Values: ${JSON.stringify(outputValues.fillValues)} `);
        this.log.debug(`Sources: ${JSON.stringify(sourceObject)} `);

        // Run once through all sources, to generate a proper output on startup
        for (const key of Object.keys(sourceObject)) {
            const tmpSource = await this.getForeignStateAsync(key);
            this.log.debug(`Loading initial for ${key} with ${JSON.stringify(tmpSource)}`);
            await this.refreshData(key, tmpSource);
        }

        // Starting Timer
        if (Object.keys(relativeTimeCheck).length > 0) {
            this.log.info(
                `Found relative Date Texts(${Object.keys(relativeTimeCheck).length}) to display. Activating timer!`,
            );
            this.log.debug(`Array for relative texts ${JSON.stringify(relativeTimeCheck)} `);
            globalInterval = this.setInterval(() => {
                this.getRelativeTimeObjects(relativeTimeCheck);
            }, 10000);
        }

        this.log.info('Configuration loaded!');
        this.log.info(`Requesting the following states: ${subscribeArray.toString()} `);

        // Renew the subscriptions
        await this.subscribeForeignStatesAsync(subscribeArray);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param options   Options for the module
     */
    module.exports = options => new EnergieflussErweitert(options);
} else {
    // otherwise start the instance directly
    new EnergieflussErweitert();
}
