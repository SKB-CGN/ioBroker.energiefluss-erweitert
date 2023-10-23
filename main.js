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
let backupDir = "/backup";
// Load your modules here, e.g.:
// const fs = require("fs");

/* Variables for runtime */
let globalConfig = {};
let sourceObject = {};
let settingsObject = {};
let rawValues = {
	values: {},
	sourceValues: {}
};

let outputValues = {
	values: {},
	unit: {},
	animations: {},
	animationProperties: {},
	fillValues: {},
	borderValues: {},
	prepend: {},
	append: {},
	css: {},
	override: {}
};

let relativeTimeCheck = {};
let globalInterval;

let subscribeArray = new Array();

/* Variables for Icon Proxy */
const http = require("http");
const https = require("https");
const url = require("url");
const BASEURL = "https://api.iconify.design/";
const error_icon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="coral" d="M11 15h2v2h-2v-2m0-8h2v6h-2V7m1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8Z"/></svg>';
let iconCacheObject = {};
let enable_proxy = false;
let proxy_port = 10123;
let _this;
let systemLang = 'en';

class EnergieflussErweitert extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'energiefluss-erweitert',
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
		// Initialize your adapter here
		enable_proxy = this.config.enable_proxy;
		proxy_port = this.config.proxy_port || 10123;
		_this = this;

		/* Create Adapter Directory */
		instanceDir = utils.getAbsoluteInstanceDataDir(this);
		if (!fs.existsSync(instanceDir + backupDir)) {
			fs.mkdirSync(instanceDir + backupDir, { recursive: true });
		}

		/* Check, if we have an old backup state */
		let tmpBackupState = await this.getStateAsync('backup');
		if (tmpBackupState) {
			let tmpBackup = JSON.parse(tmpBackupState.val);
			this.log.info("Migrating old backup to new strategy. Please wait!");
			if (Object.keys(tmpBackup).length > 0) {
				this.log.info(`${Object.keys(tmpBackup).length} Backup's found. Converting!`);
				for (var key of Object.keys(tmpBackup)) {
					let datetime = key;
					let [date, time] = datetime.split(", ");
					let [day, month, year] = date.split(".");
					let [hour, minutes, seconds] = time.split(':');

					let fileName = new Date(year, month - 1, day, hour, minutes, seconds).getTime();
					const newFilePath = path.join(instanceDir + backupDir, `BACKUP_${fileName}.json`);
					fs.writeFile(newFilePath, JSON.stringify(tmpBackup[key]), (err) => {
						if (err) {
							this.log.error(`Could not create Backup ${newFilePath}. Error: ${err}`);
						}
					});
				}
			}
			// After creation of new backup - delete the state
			this.deleteStateAsync('backup');
			this.log.info('Convertion of backups finished');
		}

		// Get language of ioBroker
		this.getForeignObjectAsync('system.config', function (err, obj) {
			if (err) {
				_this.log.error("Could not get language of ioBroker! Using english instead!");
			} else {
				systemLang = obj.common.language;
				_this.log.debug(`Using language: ${systemLang}`);
			}
		});

		this.log.info("Adapter started. Loading config!");

		/* Start the Icon Proxy Server */
		if (enable_proxy && proxy_port > 0) {
			this.startServer();
		}

		this.getConfig();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			this.clearInterval(globalInterval);
			this.log.info('Cleared interval for relative values!');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		// The state was changed
		if (id && state) {
			// The state is acknowledged
			if (state.ack) {
				this.log.debug('Refreshing ACK state from foreign state!');
				this.refreshData(id, state);
			}
			// For userdata and Javascript
			if (id.toLowerCase().includes('0_userdata.') || id.toLowerCase().includes('javascript.')) {
				this.log.debug('Refreshing state from user environment!');
				this.refreshData(id, state);
			}
		}
	}

	/**
	  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	  * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		this.log.debug(`[onMessage] received command: ${obj.command} with message: ${JSON.stringify(obj.message)}`);
		if (obj && obj.message) {
			if (typeof obj.message === 'object') {
				// Request the list of Backups
				let fileList = [];
				switch (obj.command) {
					case '_getBackups':
						fs.readdir(instanceDir + backupDir, (err, files) => {
							if (err) {
								this.sendTo(obj.from, obj.command, { err }, obj.callback);
							} else {
								files.forEach(file => {
									let tmpFile = path.parse(file).name;
									tmpFile = tmpFile.replace("BACKUP_", "");
									fileList.push(tmpFile);
								});
								this.sendTo(obj.from, obj.command, { error: null, data: fileList }, obj.callback);
							}
						});
						break;
					case '_restoreBackup':
						// Restore Backup
						this.log.info('Starting restoring Backup from disk!');
						const restorePath = path.join(instanceDir + backupDir, `BACKUP_${obj.message.fileName}.json`);
						fs.readFile(restorePath, 'utf8', (err, data) => {
							if (err) {
								this.log.info(`Error during ${err}`);
								this.sendTo(obj.from, obj.command, { error: err }, obj.callback);
							} else {
								// Store current configuration in new Backup

								// Send new config back to workspace and store in state
								this.setStateChangedAsync("configuration", { val: data, ack: true });
								this.sendTo(obj.from, obj.command, { error: null, data: JSON.parse(data) }, obj.callback);
								this.log.info('Backup restored and activated!');
							}
						});
						break;
					case '_storeBackup':
						// Store Backup
						this.log.debug('Saving Backup to disk!');
						let fileName = new Date().getTime();
						const storePath = path.join(instanceDir + backupDir, `BACKUP_${fileName}.json`);
						fs.writeFile(storePath, JSON.stringify(obj.message), (err) => {
							if (err) {
								this.sendTo(obj.from, obj.command, { err }, obj.callback);
							} else {
								this.sendTo(obj.from, obj.command, { error: null, data: "Backup stored successfully!" }, obj.callback);
							}
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
										fs.unlink(`${instanceDir}${backupDir}/${fileList[i]}`, (err) => {
											if (err) {
												this.log.warn(err);
											}
											this.log.info(`${fileList[i]} successfully deleted!`);
										});
									}
								} else {
									this.log.info('The amount of current stored backups does not exceed the number of 10!');
								}
							}
						});
						break;
				}
			} else {
				this.log.error(`[onMessage] Received incomplete message via "sendTo"`);

				if (obj.callback) {
					this.sendTo(obj.from, obj.command, { error: 'Incomplete message' }, obj.callback);
				}
			}
		}
	}
	/**
	 *  @param {number}	minutes
	 */
	getMinHours(minutes) {
		let mins = minutes;
		let m = mins % 60;
		let h = (mins - m) / 60;
		let HHMM = (h < 10 ? "0" : "") + h.toString() + ":" + (m < 10 ? "0" : "") + m.toString();
		return HHMM;
	}

	/**
	*  @param {number}	consumption
	*/
	async setConsumption(consumption) {
		await this.setStateChangedAsync('calculation.consumption.consumption', { val: consumption, ack: true });
	}

	/**
	 *  @param {string}	direction
	 *  @param {number}	energy
	 *  @param {number} battery_capacity
	 *  @param {number} battery_dod
	 */
	async calculateBatteryRemaining(direction, energy, battery_capacity, battery_dod) {
		const battPercent = await this.getForeignStateAsync(globalConfig.datasources[globalConfig.calculation.battery.percent].source);
		if (battPercent) {
			let percent = battPercent.val;
			let rest = 0;
			let mins = 0;
			let string = "--:--h";
			let target = 0;
			if (percent > 0 && energy > 0) {
				if (direction == "charge") {
					// Get the Rest to Full Charge
					rest = battery_capacity - ((battery_capacity * percent) / 100);
				}

				if (direction == "discharge") {
					// Get the Rest to Full Discharge
					rest = (battery_capacity * (percent - battery_dod)) / 100;
				}

				mins = Math.round((rest / energy) * 60);
				if (mins > 0) {
					string = this.getMinHours(mins) + "h";
					// Calculate the target time
					target = Math.floor(Date.now() / 1000) + (mins * 60);
				}
			}

			this.log.debug(`Direction: ${direction} Battery-Time: ${string} Percent: ${percent} Energy: ${energy}`);

			// Set remaining time
			await this.setStateChangedAsync("calculation.battery.remaining", { val: string, ack: true });

			// Set target of the remaining time
			await this.setStateChangedAsync("calculation.battery.remaining_target", { val: target, ack: true });

			// Set target of the remaining time in readable form
			await this.setStateChangedAsync("calculation.battery.remaining_target_DT", { val: this.getDateTime(target * 1000), ack: true });
		} else {
			this.log.warn(`Specified State for Battery-percent is invalid or NULL. Please check your configuration!`);
		}
	}

	/**
	 * @param {string} src
	 * @param {number} value
	*/
	formatOutputValue(src, value) {
		let seObj = settingsObject[src];
		// Convert to positive if necessary
		let cValue = seObj.convert ? this.convertToPositive(value) : value;
		// Convert to kW if set
		cValue = seObj.calculate_kw ? this.recalculateValue(cValue) : cValue;
		// Set decimal places
		cValue = seObj.decimal_places >= 0 ? this.decimalPlaces(cValue, seObj.decimal_places) : cValue;
		return cValue;
	}

	/**
	 * 
	 * @param {string} id 
	 * @param {object} obj 
	 * @param {object} state
	 * @param {number} value 
	 * @returns 'Calculated Value'
	 */
	calculateValue(id, obj, state, value) {
		if (obj.type == 'text') {
			// Check, if we have source options for text - Date
			if (obj.source_option != -1) {
				this.log.debug('Source Option detected! ' + obj.source_option + 'Generating DateString for ' + state.ts + ' ' + this.getTimeStamp(state.ts, obj.source_option));
				outputValues.values[id] = this.getTimeStamp(state.ts, obj.source_option);
				rawValues.values[id] = 0;
			} else {
				switch (obj.source_display) {
					case 'text':
						outputValues.values[id] = state.val;
						rawValues.values[id] = state.val;
						break;
					case 'bool':
						outputValues.values[id] = value ? systemDictionary['on'][systemLang] : systemDictionary['off'][systemLang];
						rawValues.values[id] = value;
						break;
					case 'own_text':
						outputValues.values[id] = obj.text;
						rawValues.values[id] = value;
						break;
					default:
						// Threshold need to be positive
						if (obj.threshold >= 0) {
							let subValue = 0;
							let addValue = 0;
							let formatValue;
							this.log.debug('Threshold for: ' + id + ' is: ' + obj.threshold);

							// Check, if we have Subtractions for this value
							let subArray = obj.subtract;
							if (subArray != undefined && typeof (subArray) == 'object') {
								if (subArray.length > 0) {
									if (subArray[0] != -1) {
										subValue = subArray.reduce((acc, value) => acc - (rawValues.sourceValues[value]), 0);
										this.log.debug("Subtracted by: " + subArray.toString());
									}
								}
							}

							// Check, if we have Additions for this value
							let addArray = obj.add;
							if (addArray != undefined && typeof (addArray) == 'object') {
								if (addArray.length > 0) {
									if (addArray[0] != -1) {
										addValue = addArray.reduce((acc, value) => acc + (rawValues.sourceValues[value]), 0);
										this.log.debug("Added to Value: " + addArray.toString());
									}
								}
							}

							formatValue = (Number(value) + Number(subValue) + Number(addValue));

							// Check, if value is over threshold
							if (Math.abs(formatValue) >= obj.threshold) {
								// Format Value
								outputValues.values[id] = this.formatOutputValue(id, formatValue);
							} else {
								outputValues.values[id] = obj.decimal_places >= 0 ? this.decimalPlaces(0, obj.decimal_places) : value;
							}
						}
						rawValues.values[id] = value;
						break;
				}
			}
		} else {
			if (obj.fill_type != -1 && obj.fill_type) {
				outputValues.fillValues[id] = value;
			}
			if (obj.border_type != -1 && obj.border_type) {
				outputValues.borderValues[id] = value;
			}
		}
		// Overrides for elements
		if (obj.override) {
			outputValues.override[id] = this.getOverrides(id, value, obj.override);
			this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[id])}`);
		}
	}

	/**
	 * @param {number} duration
	*/
	msToTime(duration) {
		var seconds = Math.floor((duration / 1000) % 60),
			minutes = Math.floor((duration / (1000 * 60)) % 60),
			hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
			value = systemDictionary['timer_now'][systemLang];

		if (seconds > 0) {
			if (seconds < 5 && seconds > 2) {
				value = systemDictionary['timer_few_seconds'][systemLang];
			} else if (seconds == 1) {
				//value = seconds + ' second ago';
				value = this.sprintf(systemDictionary['timer_second_ago'][systemLang], seconds);
			} else {
				value = this.sprintf(systemDictionary['timer_seconds_ago'][systemLang], seconds);
			}
		}

		if (minutes > 0) {
			if (minutes < 5 && minutes > 2) {
				value = systemDictionary['timer_few_minutes'][systemLang];
			} else if (minutes == 1) {
				value = this.sprintf(systemDictionary['timer_minute_ago'][systemLang], minutes);
			} else {
				value = this.sprintf(systemDictionary['timer_minutes_ago'][systemLang], minutes);
			}
		}

		if (hours > 0) {
			if (hours < 5 && hours > 2) {
				value = systemDictionary['timer_few_hours'][systemLang];;
			} else if (hours == 1) {
				value = this.sprintf(systemDictionary['timer_hour_ago'][systemLang], hours);
			} else {
				value = this.sprintf(systemDictionary['timer_hours_ago'][systemLang], hours);
			}
		}
		return value;
	}

	/**
	 * @param {string} format
	*/
	sprintf(format) {
		var args = Array.prototype.slice.call(arguments, 1);
		var i = 0;
		return format.replace(/%s/g, function () {
			return args[i++];
		});
	}

	/**
	 * @param {number} ts
	 * @param {string} mode
	*/
	getTimeStamp(ts, mode) {
		if (ts === undefined || ts <= 0 || ts == '') {
			return '';
		}
		let date = new Date(ts), now = new Date();

		switch (mode) {
			case 'timestamp_de':
			default:
				return date.toLocaleString('de-DE', {
					hour: "numeric",
					minute: "numeric",
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					second: "2-digit",
					hour12: false
				});
			case 'timestamp_de_short':
				return date.toLocaleString('de-DE', {
					hour: "2-digit",
					minute: "2-digit",
					day: "2-digit",
					month: "2-digit",
					year: "2-digit",
					hour12: false
				});
			case 'timestamp_de_short_wo_year':
				return date.toLocaleString('de-DE', {
					hour: "2-digit",
					minute: "2-digit",
					day: "2-digit",
					month: "2-digit",
					hour12: false
				});
			case 'timestamp_us':
				return date.toLocaleString('en-US', {
					hour: "numeric",
					minute: "numeric",
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					second: "2-digit",
					hour12: true
				});
			case 'timestamp_us_short':
				return date.toLocaleString('en-US', {
					hour: "2-digit",
					minute: "2-digit",
					day: "2-digit",
					month: "2-digit",
					year: "2-digit",
					hour12: true
				});
			case 'timestamp_us_short_wo_year':
				return date.toLocaleString('en-US', {
					hour: "2-digit",
					minute: "2-digit",
					day: "2-digit",
					month: "2-digit",
					hour12: true
				});
			case 'relative':
				return this.msToTime(Number(now - date));
		}
	}

	/**
	 * Convert a timestamp to datetime.
	 *
	 * @param {number} ts	Timestamp to be converted to date-time format (in ms)
	 *
	 */
	getDateTime(ts) {
		if (ts === undefined || ts <= 0 || ts == '')
			return '';

		let date = new Date(ts);
		let day = '0' + date.getDate();
		let month = '0' + (date.getMonth() + 1);
		let year = date.getFullYear();
		let hours = '0' + date.getHours();
		let minutes = '0' + date.getMinutes();
		let seconds = '0' + date.getSeconds();
		return day.substr(-2) + '.' + month.substr(-2) + '.' + year + ' ' + hours.substr(-2) + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	async getRelativeTimeObjects(obj) {
		for (var key of Object.keys(obj)) {
			const stateValue = await this.getForeignStateAsync(obj[key].source);
			if (stateValue) {
				outputValues.values[key] = this.getTimeStamp(stateValue.ts, obj[key].option);
			}
		}
	}

	/**
	 * @param {number} value
	 */
	recalculateValue(value) {
		return (Math.round((value / 1000) * 100) / 100);
	}

	/**
	 * @param {number} value
	 * @param {number} decimal_places
	 */
	decimalPlaces(value, decimal_places) {
		return Number(value).toFixed(decimal_places);
	}

	/**
	 * @param {number} value
	 */
	convertToPositive(value) {
		return value < 0 ? (value * -1) : value;
	}

	/**
	 * @param {number} maxDuration
	 * @param {number} maxPower
	 * @param {number} currentPower
	 */

	calculateDuration(maxDuration, maxPower, currentPower) {
		// Max Duration
		let cur = Number(currentPower);
		let max = Number(maxPower);
		let dur = Number(maxDuration);
		let result = Math.round((max / cur) * dur);
		result = result > 60000 ? 60000 : result;

		return result;
	}

	/**
	 * @param {number} maxDots
	 * @param {number} maxPower
	 * @param {number} currentPower
	 */

	calculateStrokeArray(maxDots, maxPower, currentPower) {
		// Collect all Values
		let strokeDash = '';
		let total = 136;
		let l_amount = Math.round((((currentPower / maxPower) * 100) * maxDots) / 100);
		let l_distance = globalConfig.animation_configuration.distance;
		let l_length = globalConfig.animation_configuration.length;

		if (l_amount > 0 && l_length > 0 && l_distance) {
			for (let i = 0; i < l_amount; i++) {
				if (l_distance > 0 && l_length > 0) {
					strokeDash += l_length + ' ';
					if (i != l_amount - 1) {
						strokeDash += l_distance + ' ';
						total -= l_distance;
					}
					total -= l_length;
				}
			}
			strokeDash += ` ${total < 0 ? l_distance : total}`;
		} else {
			strokeDash = l_length + ' ' + (total - l_length);
		}

		return strokeDash;
	}

	/**
	 * 
	 * @param {string} id 
	 * @param {number} condValue 
	 * @param {object} object 
	 * @returns 
	 */
	getOverrides(id, condValue, object) {
		let result = {};
		let tmpObj = {};

		for (var _key in object) {
			// Order them
			let workObj = typeof (object[_key]) === 'string' ? JSON.parse(object[_key]) : object[_key];
			tmpObj[_key] = Object.keys(workObj)
				.sort(
					(a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
				.reduce(
					(obj, key) => {
						obj[key] = workObj[key];
						return obj;
					},
					{}
				);
			try {
				let func = Function(`return ${condValue}${_key}`)();
				if (func) {
					result = object[_key];
				}
			}
			catch (error) {
				this.log.warn(`Overrides for element ${id} can not be processed, as they are not correctly formatted!`);
			}
		}
		return result;
	}

	/**
	 * @param {string} id	ID of the state
	 * @param {object} state	State itself
	 */
	async refreshData(id, state) {
		let clearValue;
		let cssRules = new Array();
		if (id == this.namespace + '.configuration') {
			this.log.info('Configuration changed via Workspace! Reloading config!');
			this.getConfig();
		} else {
			// Check, if we handle this source inside our subscribtion
			if (sourceObject.hasOwnProperty(id)) {
				// Correct the Value if not Number
				if (typeof (state.val) === 'string') {
					clearValue = Number(state.val.replace(/[^\d.-]/g, ''));
				} else {
					clearValue = state.val;
				}

				// sourceObject for this state-id
				let soObj = sourceObject[id];

				// Put Value into RAW-Source-Values
				rawValues.sourceValues[soObj.id] = clearValue;

				// Loop through each addSource
				if (soObj.hasOwnProperty('addSources') && soObj['addSources'].length) {
					this.log.debug(`Updated through addSources: ${JSON.stringify(rawValues.sourceValues)}`);

					// Run through element addition to update the addition
					for (var _key of Object.keys(soObj.addSources)) {
						let src = soObj.addSources[_key];

						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Value-Settings for Element " + src + " found! Applying Settings!");
							this.calculateValue(src, settingsObject[src], state, rawValues.values[src]);
						}
					}
				}

				// Loop through each subtractSource
				if (soObj.hasOwnProperty('subtractSources') && soObj['subtractSources'].length) {
					this.log.debug(`Updated through subtractSources: ${JSON.stringify(rawValues.sourceValues)}`);

					// Run through element addition to update the addition
					for (var _key of Object.keys(soObj.subtractSources)) {
						let src = soObj.subtractSources[_key];

						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Value-Settings for Element " + src + " found! Applying Settings!");
							this.calculateValue(src, settingsObject[src], state, rawValues.values[src]);
						}
					}
				}

				// Loop through each Element, which belongs to that source
				if (soObj.hasOwnProperty('elmSources') && soObj['elmSources'].length) {
					this.log.debug(`Updated through sources: ${JSON.stringify(rawValues.sourceValues)}`);

					// Run through element sources to update the sources
					for (var _key of Object.keys(soObj.elmSources)) {
						let src = soObj.elmSources[_key];

						// Put ID into CSS-Rule for later use
						cssRules.push(src);

						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Value-Settings for Element " + src + " found! Applying Settings!");
							this.calculateValue(src, settingsObject[src], state, clearValue);
						}
					}
				}

				// Check, if that Source belongs to battery-charge or discharge, to determine the time
				if (globalConfig.hasOwnProperty('calculation')) {
					// Battery Remaining
					if (globalConfig.calculation.hasOwnProperty('battery')) {
						let batObj = globalConfig.calculation.battery;
						if (soObj.id == batObj.charge || soObj.id == batObj.discharge) {
							if (batObj.charge != -1 && batObj.discharge != -1 && batObj.percent != -1) {
								let direction = 'none';
								let energy = 0;
								let dod = batObj.dod ? batObj.dod : 0;

								// Battery
								let batteryCharge = batObj.charge_kw ? Math.abs(clearValue * 1000) : Math.abs(clearValue);
								let batteryDischarge = batObj.discharge_kw ? Math.abs(clearValue * 1000) : Math.abs(clearValue);

								if (batObj.charge != batObj.discharge) {
									if (soObj.id == batObj.charge) {
										direction = 'charge';
										energy = batteryCharge;
									}
									if (soObj.id == batObj.discharge) {
										direction = 'discharge';
										energy = batteryDischarge;
									}
								}

								if (batObj.charge == batObj.discharge) {
									if (clearValue > 0) {
										if (!batObj.charge_prop) {
											direction = 'charge';
											energy = batteryCharge;
										}
										if (!batObj.discharge_prop) {
											direction = 'discharge';
											energy = batteryDischarge;
										}
									}
									if (clearValue < 0) {
										if (batObj.charge_prop) {
											direction = 'charge';
											energy = batteryCharge
										}
										if (batObj.discharge_prop) {
											direction = 'discharge';
											energy = batteryDischarge;
										}
									}
								}
								this.calculateBatteryRemaining(direction, energy, batObj.capacity, dod);
							}
						}
					}

					// Consumption calculation
					if (globalConfig.calculation.hasOwnProperty('consumption')) {
						let consObj = globalConfig.calculation.consumption;
						if (soObj.id == consObj.gridFeed || soObj.id == consObj.gridConsume || soObj.id == consObj.batteryCharge ||
							soObj.id == consObj.batteryDischarge || consObj.production.indexOf(soObj.id) >= 0) {
							if (consObj.production.indexOf(-1) != 0) {
								this.log.debug("Calculation for consumption should be possible!");

								// Calc all Production states
								let prodArray = consObj.production;
								let prodValue = 0;

								// Grid
								let gridFeed = consObj.gridFeed_kw ? rawValues.sourceValues[consObj.gridFeed] * 1000 : rawValues.sourceValues[consObj.gridFeed];
								let gridConsume = consObj.gridConsume_kw ? rawValues.sourceValues[consObj.gridConsume] * 1000 : rawValues.sourceValues[consObj.gridConsume];

								// Battery
								let batteryCharge = consObj.batteryCharge_kw ? rawValues.sourceValues[consObj.batteryCharge] * 1000 : rawValues.sourceValues[consObj.batteryCharge];
								let batteryDischarge = consObj.batteryDischarge_kw ? rawValues.sourceValues[consObj.batteryDischarge] * 1000 : rawValues.sourceValues[consObj.batteryDischarge];

								// Consumption
								let consumption = 0;

								// Production state(s)
								if (prodArray.length > 0) {
									for (var sub in prodArray) {
										if (prodArray[sub] != -1) {
											prodValue = prodValue + Math.abs(rawValues.sourceValues[prodArray[sub]]);
										}
									}
								}

								// Put all things together
								consumption = consObj.production_kw ? prodValue * 1000 : prodValue;

								// Subtract or add grid - different States
								if (consObj.gridFeed != consObj.gridConsume) {
									// Feed-In - Subtract
									if (Math.abs(gridFeed) > Math.abs(gridConsume)) {
										consumption = consumption - Math.abs(gridFeed);
									}

									// Feed-Consumption - Add
									if (Math.abs(gridFeed) < Math.abs(gridConsume)) {
										consumption = consumption + Math.abs(gridConsume);
									}
								}

								// Subtract or add grid - same States
								if (consObj.gridFeed == consObj.gridConsume) {
									if (gridFeed > 0) {
										if (!consObj.gridFeed_prop) {
											consumption = consumption - Math.abs(gridFeed);
										}
										if (!consObj.gridConsume_prop) {
											consumption = consumption + Math.abs(gridConsume);
										}
									}
									// Consuming from grid
									if (gridFeed < 0) {
										if (consObj.gridFeed_prop) {
											consumption = consumption - Math.abs(gridFeed);
										}
										if (consObj.gridConsume_prop) {
											consumption = consumption + Math.abs(gridConsume);
										}
									}
								}

								// Subtract or add battery
								if (consObj.batteryCharge != consObj.batteryDischarge) {
									// Charge - Subtract
									if (Math.abs(batteryCharge) > Math.abs(batteryDischarge)) {
										consumption = consumption - Math.abs(batteryCharge);
									}

									// Discharge - Add
									if (Math.abs(batteryCharge) < Math.abs(batteryDischarge)) {
										consumption = consumption + Math.abs(batteryDischarge);
									}
								}

								// Subtract or add battery - same States
								if (consObj.batteryCharge == consObj.batteryDischarge) {
									if (batteryCharge > 0) {
										if (!consObj.batteryCharge_prop) {
											consumption = consumption - Math.abs(batteryCharge);
										}
										if (!consObj.batteryDischarge_prop) {
											consumption = consumption + Math.abs(batteryDischarge);
										}
									}

									if (batteryCharge < 0) {
										if (consObj.batteryCharge_prop) {
											consumption = consumption - Math.abs(batteryCharge);
										}
										if (consObj.batteryDischarge_prop) {
											consumption = consumption + Math.abs(batteryDischarge);
										}
									}
								}

								// Debug Log
								this.log.debug(`Current Values for calculation of consumption: Production: ${prodValue}, Battery: ${batteryCharge} / ${batteryDischarge} , Grid: ${gridFeed} / ${gridConsume} - Consumption: ${consumption}`);

								// Write to state
								this.setConsumption(consumption);
							}
						}
					}
				}

				// Animations
				if (soObj.hasOwnProperty('elmAnimations')) {
					this.log.debug(`Found corresponding animations for ID: ${id}! Applying!`);
					for (var _key of Object.keys(soObj.elmAnimations)) {
						let src = soObj.elmAnimations[_key];
						// Object Variables
						let tmpType, tmpStroke, tmpDuration, tmpOption;

						// Put ID into CSS-Rule for later use
						cssRules.push(src);

						let tmpAnimValid = true;
						// Animations
						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug(`Animation-Settings for Element ${src} found! Applying Settings!`);
							let seObj = settingsObject[src];

							if (seObj.type != -1 && seObj != undefined) {
								if (seObj.type == 'dots') {
									tmpType = 'dots';
									tmpStroke = this.calculateStrokeArray(seObj.dots, seObj.power, Math.abs(clearValue));
								}
								if (seObj.type == 'duration') {
									tmpType = 'duration';
									tmpDuration = this.calculateDuration(seObj.duration, seObj.power, Math.abs(clearValue));
								}
							}

							switch (seObj.properties) {
								case 'positive':
									this.log.debug('Animation has a positive factor!');
									if (clearValue > 0) {
										if (clearValue >= seObj.threshold) {
											this.log.debug(`Value: ${clearValue} is greater than Threshold: ${seObj.threshold}. Applying Animation!`);
											tmpAnimValid = true;
											tmpOption = '';
										} else {
											this.log.debug(`Value: ${clearValue} is smaller than Threshold: ${seObj.threshold}. Deactivating Animation!`);
											tmpAnimValid = false;
										}
									} else {
										if (seObj.option) {
											if (clearValue <= seObj.threshold * -1) {
												tmpAnimValid = true;
												// Set Option
												tmpOption = 'reverse';
											} else {
												tmpAnimValid = false;
											}
										} else {
											tmpAnimValid = false;
										}
									}
									break;
								case 'negative':
									this.log.debug('Animation has a negative factor!');
									if (clearValue < 0) {
										if (clearValue <= seObj.threshold * -1) {
											this.log.debug(`Value: ${clearValue} is greater than Threshold: ${seObj.threshold * -1}. Applying Animation!`);
											tmpAnimValid = true;
											tmpOption = '';
										} else {
											this.log.debug(`Value: ${clearValue} is smaller than Threshold: ${seObj.threshold * -1}. Deactivating Animation!`);
											tmpAnimValid = false;
										}
									} else {
										if (seObj.option) {
											if (clearValue >= seObj.threshold) {
												tmpAnimValid = true;
												// Set Option
												tmpOption = 'reverse';
											} else {
												tmpAnimValid = false;
											}
										} else {
											tmpAnimValid = false;
										}
									}
									break;
							}

							// Set Animation
							outputValues.animations[src] = tmpAnimValid;

							// Create Animation Object
							outputValues.animationProperties[src] = {
								type: tmpType,
								duration: tmpDuration,
								stroke: tmpStroke,
								option: tmpOption
							};

							// Overrides for Animations
							if (seObj.override) {
								outputValues.override[src] = this.getOverrides(id, clearValue, seObj.override);
								this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[src])}`);
							}

							// Overrides for Lines
							let line_id = src.replace('anim', 'line');
							if (settingsObject.hasOwnProperty(line_id)) {
								outputValues.override[line_id] = this.getOverrides(id, clearValue, settingsObject[line_id].override);
								this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[line_id])}`);
							}
						}
					}
				}

				// Put CSS together
				if (cssRules.length > 0) {
					cssRules.forEach((src) => {
						let seObj = settingsObject[src];

						// CSS Rules
						if (seObj.source_type == 'boolean') {
							this.log.debug(`Setting for boolean ${JSON.stringify(seObj)} and ID: ${src}`);
							if (clearValue == 1) {
								outputValues.css[src] = {
									actPos: seObj.css_active_positive,
									inactPos: seObj.css_inactive_positive
								}
							}
							if (clearValue == 0) {
								outputValues.css[src] = {
									actPos: seObj.css_inactive_positive,
									inactPos: seObj.css_active_positive
								}
							}
						} else {
							if (seObj.threshold >= 0) {
								if (Math.abs(clearValue) > seObj.threshold) {
									// CSS Rules
									if (clearValue > 0) {
										// CSS Rules - Positive
										outputValues.css[src] = {
											actPos: seObj.css_active_positive,
											inactPos: seObj.css_inactive_positive,
											actNeg: "",
											inactNeg: seObj.css_active_negative
										};
									}
									if (clearValue < 0) {
										// CSS Rules - Negative
										outputValues.css[src] = {
											actNeg: seObj.css_active_negative,
											inactNeg: seObj.css_inactive_negative,
											actPos: "",
											inactPos: seObj.css_active_positive
										};
									}
								} else {
									// CSS Rules
									if (clearValue > 0) {
										// CSS Rules - Positive
										outputValues.css[src] = {
											actPos: seObj.css_inactive_positive,
											inactPos: seObj.css_active_positive,
											actNeg: "",
											inactNeg: seObj.css_active_negative
										};
									}
									if (clearValue < 0) {
										// CSS Rules - Negative
										outputValues.css[src] = {
											actNeg: seObj.css_inactive_negative,
											inactNeg: seObj.css_active_negative,
											actPos: "",
											inactPos: seObj.css_active_positive
										};
									}
									if (clearValue == 0) {
										// CSS Rules - Positive
										outputValues.css[src] = {
											actPos: "",
											inactPos: seObj.css_active_positive + ' ' + seObj.css_inactive_positive,
											actNeg: "",
											inactNeg: seObj.css_active_negative + ' ' + seObj.css_inactive_negative
										};
									}
								}
							}
						}
					});
				}

				this.log.debug(`State changed! New value for Source: ${id} with Value: ${clearValue} belongs to Elements: ${soObj.elmSources.toString()}`);

				// Build Output
				this.setDataState();
			} else {
				this.log.warn(`State changed! New value for Source: ${id} with Value: ${clearValue} belongs to Elements, which were not found! Please check them!`);
			}
		}
	}

	async setDataState() {
		await this.setStateChangedAsync('data', { val: JSON.stringify(outputValues), ack: true });
	}

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
			animationProperties: {},
			prepend: {},
			append: {},
			css: {},
			override: {}
		};
		rawValues = {
			values: {},
			sourceValues: {}
		};
		sourceObject = {};
		settingsObject = {};
		let stateObject = {};
		relativeTimeCheck = {};

		// Put own DP
		subscribeArray.push(this.namespace + '.configuration');

		// Read configuration DataPoint
		let tmpConfig = await this.getStateAsync('configuration');
		try {
			globalConfig = JSON.parse(tmpConfig.val);
		}
		catch (e) {
			this.log.warn("This is the first time, the adapter starts. Setting config to default (empty)!");
			globalConfig = {};
		}
		this.log.debug(JSON.stringify(globalConfig));

		// Collect all Datasources
		if (globalConfig.hasOwnProperty('datasources')) {
			for (var key of Object.keys(globalConfig.datasources)) {
				const value = globalConfig.datasources[key];
				this.log.debug(`Datasource: ${JSON.stringify(value)}`);
				if (value.source != '' && value.hasOwnProperty('source')) {
					try {
						const stateValue = await this.getForeignStateAsync(globalConfig.datasources[key].source);
						if (stateValue) {
							// Create sourceObject, for handling sources
							sourceObject[globalConfig.datasources[key].source] = {
								id: parseInt(key),
								elmSources: [],
								elmAnimations: [],
								addSources: [],
								subtractSources: []
							};
							rawValues.sourceValues[key] = stateValue.val;

							// Add to SubscribeArray
							subscribeArray.push(value.source);

							// Complete state for temporary use
							stateObject[globalConfig.datasources[key].source] = stateValue;
						} else {
							this.log.warn(`The adapter could not find the state '${value.source}'! Please review your configuration of the adapter!`);
						}
					} catch (error) {
						this.log.warn(`The adapter could not access the state '${value.source}'! The state seems to be deleted! Please review your configuration of the adapter!`);
					}
				}
			}
		}

		// Collect the Elements, which are using the sources
		if (globalConfig.hasOwnProperty('elements')) {
			for (var key of Object.keys(globalConfig.elements)) {
				const value = globalConfig.elements[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					if (globalConfig.datasources.hasOwnProperty(value.source)) {
						try {
							const stateValue = await this.getForeignStateAsync(globalConfig.datasources[value.source].source);
							const objObject = await this.getForeignObjectAsync(globalConfig.datasources[value.source].source);
							if (stateValue) {
								// Save Settings for each object
								settingsObject[key] = {
									threshold: value.threshold || 0,
									calculate_kw: value.calculate_kw,
									decimal_places: value.decimal_places,
									convert: value.convert,
									type: value.type,
									source_option: value.source_option,
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
									text: value.text
								};

								// Append and prepend
								outputValues.append[key] = value.append;
								outputValues.prepend[key] = value.prepend;

								// Unit
								outputValues.unit[key] = value.unit;

								// Put into timer object for re-requesting
								if (value.source_option == 'relative') {
									relativeTimeCheck[key] = {
										source: globalConfig.datasources[value.source].source,
										option: value.source_option
									}
								}

								// Put elment ID into Source
								sourceObject[globalConfig.datasources[value.source].source].elmSources.push(key);

								// Put add ID's into addition array
								if (value.add != undefined && typeof (value.add) == 'object') {
									if (value.add.length > 0) {
										for (var add in value.add) {
											if (value.add[add] != -1) {
												sourceObject[globalConfig.datasources[value.add[add]].source].addSources.push(key);
											}
										}
									}
								}

								// Put subtract ID's into substraction array
								if (value.subtract != undefined && typeof (value.subtract) == 'object') {
									if (value.subtract.length > 0) {
										for (var subtract in value.subtract) {
											if (value.subtract[subtract] != -1) {
												sourceObject[globalConfig.datasources[value.subtract[subtract]].source].subtractSources.push(key);
											}
										}
									}
								}
							}
						} catch (error) {
							this.log.warn(`The adapter could not access the state '${globalConfig.datasources[value.source].source}'! The state seems to be deleted! Please review your configuration of the adapter!`);
						}
					} else {
						this.log.warn(`Element with ID ${key} of Type ${value.type} is using source '${value.source}', which ist not available!`);
					}
				}
			}
		}

		// Animations
		if (globalConfig.hasOwnProperty('animations')) {
			for (var key of Object.keys(globalConfig.animations)) {
				const value = globalConfig.animations[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					this.log.debug(`Animation for Source: ${value.source} is: ${key}`);
					// Save Settings for each object
					settingsObject[key] = {
						properties: value.animation_properties,
						option: value.animation_option,
						threshold: value.threshold,
						type: value.animation_type,
						duration: value.duration,
						power: value.power,
						dots: value.dots,
						css_general: value.css_general,
						css_active_positive: value.css_active_positive,
						css_inactive_positive: value.css_inactive_positive,
						css_active_negative: value.css_active_negative,
						css_inactive_negative: value.css_inactive_negative,
						override: value.override
					};

					// Put Animation into Source
					sourceObject[globalConfig.datasources[value.source].source].elmAnimations.push(key);

					// Check, if corresponding line has override properties as well
					let line_id = key.replace('anim', 'line');
					if (globalConfig.lines[line_id].hasOwnProperty('override')) {
						this.log.debug(`Found override for line ${line_id} in combination with Animation ${key}`);
						settingsObject[line_id] = {
							override: globalConfig.lines[line_id].override
						}
					}
				} else {
					this.log.debug(`Animation for Source: ${value.source} not found!`);
				}
			}
		}

		this.log.debug(`CSS: ${JSON.stringify(outputValues.css)}`);
		this.log.debug(`Settings: ${JSON.stringify(settingsObject)}`);
		this.log.debug(`Initial Values: ${JSON.stringify(outputValues.values)}`);
		this.log.debug(`Initial Fill-Values: ${JSON.stringify(outputValues.fillValues)}`);
		this.log.debug(`Sources: ${JSON.stringify(sourceObject)}`);
		this.log.debug(`States: ${JSON.stringify(stateObject)}`);
		this.log.debug(`RAW-Values: ${JSON.stringify(rawValues.values)}`);
		this.log.debug(`RAW - Source - Values: ${JSON.stringify(rawValues.sourceValues)}`);

		// Run once through all sources, to generate a proper output on startup
		for (var key of Object.keys(sourceObject)) {
			this.refreshData(key, stateObject[key]);
		}

		// Starting Timer
		if (Object.keys(relativeTimeCheck).length > 0) {
			this.log.info(`Found relative Date Texts (${Object.keys(relativeTimeCheck).length}) to display. Activating timer!`);
			this.log.debug(`Array for relative texts ${relativeTimeCheck}`);
			globalInterval = this.setInterval(() => {
				this.getRelativeTimeObjects(relativeTimeCheck);
			}, 10000);
		}
		this.setDataState();

		this.log.info('Configuration loaded!');
		this.log.info(`Requesting the following states: ${subscribeArray.toString()}`);

		// Renew the subscriptions
		await this.subscribeForeignStatesAsync(subscribeArray);
	}

	startServer() {
		function requestListener(req, res) {
			try {
				let query = url.parse(req.url, true).query;
				let callback = query.callback;
				let message;
				res.setHeader("Content-Type", "text");
				// Query for icon
				switch (query.serve) {
					case "icon":
						if (query.icon) {
							// Check, if icon is available in Cache
							if (iconCacheObject.hasOwnProperty(query.icon)) {
								iconCacheObject[query.icon].status = 'served via Cache';
								res.writeHead(200);
								res.end(callback + '(' + JSON.stringify(iconCacheObject[query.icon]) + ")");
								_this.log.debug(`Icon ${query.icon} served via: ${iconCacheObject[query.icon].status}`);
							} else {
								let icon = query.icon.split(":");
								let url = `${BASEURL}${icon[0]}/${icon[1]}.svg?width=${query.width}&height=${query.height}`;
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
												iconCacheObject[query.icon] = {
													icon: message,
													status: 'served via Server'
												}
												res.writeHead(200);
												res.end(callback + '(' + JSON.stringify(iconCacheObject[query.icon]) + ")");
											} else {
												// Put Icon into cache
												iconCacheObject[query.icon] = {
													icon: error_icon,
													message: "Icon not found!",
													status: 'served via Server'
												}
												res.writeHead(200);
												res.end(callback + '(' + JSON.stringify(iconCacheObject[query.icon]) + ")");
											}
											_this.log.debug(`Icon ${query.icon} served via: ${iconCacheObject[query.icon].status}`);
										} else {
											// Server down or not found
											res.writeHead(200);
											res.end(callback + '(' + JSON.stringify(error_icon) + ")");
										}
									});
								}).on('error', err => {
									this.log.error('Icon-Proxy-Error: ', err.message);
								});
							}
						} else {
							res.writeHead(404);
							res.end("No Icon specified!");
						}
						break;
					default:
						res.writeHead(404);
						res.end("Request could not be handled! Please make sure, to request the icon via: ?serve=icon&icon=NameOfIcon");
				}
			}
			catch (error) {
				_this.log.error(`Something went wrong during processing Data inside Icon-Proxy! ${error}`);
			}
		}

		const server = http.createServer(requestListener);
		server.listen(proxy_port, () => {
			this.log.info(`Icon Proxy - Server is running on Port: ${proxy_port}`);
		});
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new EnergieflussErweitert(options);
} else {
	// otherwise start the instance directly
	new EnergieflussErweitert();
}