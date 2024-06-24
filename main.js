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
const userFiles = '/userFiles';

let sharp;
try {
	sharp = require('sharp');
} catch (e) {
	console.error(`Cannot load sharp: ${e}`);
}

/* Variables for runtime */
let globalConfig = {};
let sourceObject = {};
let settingsObj = {};
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
	override: {},
	img_href: {}
};

let relativeTimeCheck = {};
let globalInterval;

let subscribeArray = new Array();

/* Variables for Icon Proxy */
const http = require('http');
const https = require('https');
const url = require('url');
const BASEURL = 'https://api.iconify.design/';
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

		/* Create Adapter Directory - Backup */
		instanceDir = utils.getAbsoluteInstanceDataDir(this);
		if (!fs.existsSync(instanceDir + backupDir)) {
			fs.mkdirSync(instanceDir + backupDir, { recursive: true });
		}

		/* Create Adapter Directory - UserFiles */
		if (!fs.existsSync(instanceDir + userFiles)) {
			fs.mkdirSync(instanceDir + userFiles, { recursive: true });
		}

		/* Create Folder thumbnails, if 'sharp' was found and can be used */
		if (sharp) {
			if (!fs.existsSync(instanceDir + userFiles + '/thumbnail')) {
				fs.mkdirSync(instanceDir + userFiles + '/thumbnail', { recursive: true });
			}
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
				_this.log.error('Could not get language of ioBroker! Using english instead!');
			} else {
				systemLang = obj.common.language;
				_this.log.debug(`Using language: ${systemLang}`);
			}
		});

		// Delete old Objects
		this.deleteStateAsync('backup');
		this.deleteStateAsync('battery_remaining');

		this.log.info('Adapter started. Loading config!');

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
	async onStateChange(id, state) {
		// The state was changed
		if (id && state) {
			// The state is acknowledged
			if (state.ack) {
				this.log.debug('Refreshing ACK state from foreign state!');
				await this.refreshData(id, state);
			}
			// For userdata and Javascript
			if (id.toLowerCase().startsWith('0_userdata.') || id.toLowerCase().startsWith('javascript.') || id.toLowerCase().startsWith('alias.')) {
				this.log.debug(`Refreshing state from user environment! ${id}`);
				await this.refreshData(id, state);
			}
		}
	}

	/**
	  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	  * @param {ioBroker.Message} obj
	 */
	async onMessage(obj) {
		//this.log.debug(`[onMessage] received command: ${obj.command} with message: ${JSON.stringify(obj.message)}`);
		if (obj && obj.message) {
			if (typeof obj.message === 'object') {
				// Request the list of Backups
				let fileList = [];
				switch (obj.command) {
					case '_deleteUpload':
						const unlinkPath = path.join(instanceDir + userFiles, obj.message.filename);
						fs.unlink(unlinkPath, (err) => {
							if (err) {
								this.log.error(`Could not delete the file ${unlinkPath}. Error: ${err}`);
								this.sendTo(obj.from, obj.command, { error: err, filename: null }, obj.callback);
							} else {
								this.sendTo(obj.from, obj.command, { error: null, filename: obj.message.filename, msg: 'File successfully deleted!' }, obj.callback);

								// Delete the thumbnail as well
								if (fs.existsSync(instanceDir + userFiles + '/thumbnail')) {
									fs.unlinkSync(path.join(instanceDir + userFiles + '/thumbnail/' + obj.message.filename));
								}
							}
						});
						break;
					case '_getUploads':
						let filePath = '/';
						/* If thumbnail folder is found, we can use the thumbnails to be delivered */
						if (fs.existsSync(instanceDir + userFiles + '/thumbnail')) {
							filePath = '/thumbnail/';
						}

						const listUploads = path.join(instanceDir + userFiles);
						const dirents = fs.readdirSync(listUploads, { withFileTypes: true });
						const filesNames = dirents
							.filter(dirent => dirent.isFile())
							.map(dirent => dirent.name);

						this.sendTo(obj.from, obj.command, { error: null, files: filesNames, path: filePath }, obj.callback);
						break;
					case '_uploadFile':
						const uploadPath = path.join(instanceDir + userFiles, obj.message.filename);
						this.log.info(`Checking requirements for uploading a new file to: ${uploadPath}`);
						if (!fs.existsSync(uploadPath)) {
							this.log.info('Uploading!');
							const imgData = Buffer.from(obj.message.fileData, "base64");
							fs.writeFile(uploadPath, imgData, (error) => {
								if (error) {
									this.log.error(`Could not upload the file ${uploadPath}. Error: ${error}`);
									this.sendTo(obj.from, obj.command, { error: error, url: null }, obj.callback);
								} else {
									this.log.info('Trying to create thumbail!');

									/* Create the thumbnail here */
									if (sharp) {
										sharp(imgData)
											.resize({
												width: 100,
												fit: 'contain'
											})
											.toFile(path.join(instanceDir + userFiles + '/thumbnail/' + obj.message.filename))
											.then(() => {
												this.log.info('Thumbnail created!');
												this.sendTo(obj.from, obj.command, { error: null, filename: obj.message.filename, msg: 'File uploaded successfully!', path: '/thumbnail/' }, obj.callback);
											});
									} else {
										this.log.warn('Module sharp is not installed, which is needed for Thumbail creation. Please install it to create thumbail images!');
										this.sendTo(obj.from, obj.command, { error: null, filename: obj.message.filename, msg: 'File uploaded successfully!', path: '/' }, obj.callback);
									}
								}
							});
						} else {
							this.log.warn('The file already exists!');
							this.sendTo(obj.from, obj.command, { error: 'File already exists!', filename: obj.message.filename }, obj.callback);
						}
						break;
					case '_getBackups':
						const listBackups = path.join(instanceDir + backupDir)
						fs.readdir(listBackups, (err, files) => {
							if (err) {
								this.sendTo(obj.from, obj.command, { err }, obj.callback);
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
					case '_restoreBackup':
						// Restore Backup
						this.log.info('Starting restoring Backup from disk!');
						const restorePath = path.join(instanceDir + backupDir, `BACKUP_${obj.message.filename}.json`);
						fs.readFile(restorePath, 'utf8', (err, data) => {
							if (err) {
								this.log.info(`Error during ${err}`);
								this.sendTo(obj.from, obj.command, { error: err }, obj.callback);
							} else {
								// Store current configuration in new Backup

								// Send new config back to workspace and store in state
								this.setStateChangedAsync('configuration', { val: data, ack: true });
								this.sendTo(obj.from, obj.command, { error: null, data: JSON.parse(data) }, obj.callback);
								this.log.info('Backup restored and activated!');
							}
						});
						break;
					case '_storeBackup':
						// Store Backup
						this.log.debug('Saving Backup to disk!');
						let filename = new Date().getTime();
						const storePath = path.join(instanceDir + backupDir, `BACKUP_${filename}.json`);
						fs.writeFile(storePath, JSON.stringify(obj.message), (err) => {
							if (err) {
								this.sendTo(obj.from, obj.command, { err }, obj.callback);
							} else {
								this.sendTo(obj.from, obj.command, { error: null, data: 'Backup stored successfully!' }, obj.callback);
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
					case '_updateElementInView':
						// Receive Object from ioBroker to show it in Configuration
						let id = `tmp_${obj.message.id}`;
						let state = await this.getForeignStateAsync(obj.message.source);
						if (state) {
							this.calculateValue(id, obj.message, state, state.val);
							this.log.debug(`Found ${obj.message.source} and calculated the value for Web-ID: ${id}!`);
							if (outputValues.values.hasOwnProperty(id)) {
								let override = {};
								override[obj.message.id] = outputValues.override[id];

								this.sendTo(obj.from, obj.command, {
									error: null,
									data: {
										id: obj.message.id,
										value: outputValues.values[id],
										override: override
									}
								}, obj.callback);

								// Delete temporary values
								delete outputValues.override[id];
								delete outputValues.values[id];
							} else {
								this.sendTo(obj.from, obj.command, { error: 'There was an error, while getting the updated value!' }, obj.callback);
							}
						}
						break;
					default:
						this.log.warn(`[onMessage] Received command "${obj.command}" via 'sendTo', which is not implemented!`);
						this.sendTo(obj.from, obj.command, { error: `Received command "${obj.command}" via 'sendTo', which is not implemented!` }, obj.callback);
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
	 *  @param {number}	minutes
	 */
	getMinHours(minutes) {
		let mins = minutes;
		let m = mins % 60;
		let h = (mins - m) / 60;
		let HHMM = (h < 10 ? '0' : '') + h.toString() + ':' + (m < 10 ? '0' : '') + m.toString();
		return HHMM;
	}

	/**
	 * @param {number} consumption
	 */
	async setConsumption(consumption) {
		await this.setStateChangedAsync('calculation.consumption.consumption', { val: consumption, ack: true });
	}

	/**
	 * @param {number} production
	 */
	async setProduction(production) {
		await this.setStateChangedAsync('calculation.production.production', { val: production, ack: true });
	}

	/**
	 * @param {number} grid
	 * @param {number} solar
	 */
	async setBatteryCharge(grid, solar) {
		await this.setStateChangedAsync('calculation.battery.charging_grid', { val: grid, ack: true });
		await this.setStateChangedAsync('calculation.battery.charging_solar', { val: solar, ack: true });
	}

	/**
	 *  @param {string}	direction
	 *  @param {number}	energy
	 */
	async calculateBatteryRemaining(direction, energy) {
		if (globalConfig.datasources.hasOwnProperty(globalConfig.calculation.battery.percent)) {
			const battPercent = await this.getForeignStateAsync(globalConfig.datasources[globalConfig.calculation.battery.percent].source);
			if (battPercent) {
				/* Get States for additional Battery Details if present */
				// Capacity
				let capacity = rawValues.sourceValues.hasOwnProperty(globalConfig.calculation.battery.capacity) ? rawValues.sourceValues[globalConfig.calculation.battery.capacity] : globalConfig.calculation.battery.capacity;

				// Deep of Discharge
				let dod = rawValues.sourceValues.hasOwnProperty(globalConfig.calculation.battery.dod) ? rawValues.sourceValues[globalConfig.calculation.battery.dod] : globalConfig.calculation.battery.dod;

				let percent = battPercent.val;
				let rest = 0;
				let mins = 0;
				let string = '--:--h';
				let target = 0;
				if (percent > 0 && energy > 0) {
					if (direction == 'charge') {
						// Get the Rest to Full Charge
						rest = capacity - ((capacity * percent) / 100);
					}

					if (direction == 'discharge') {
						// Get the Rest to Full Discharge
						rest = (capacity * (percent - dod)) / 100;
					}

					mins = Math.round((rest / energy) * 60);
					if (mins > 0) {
						string = this.getMinHours(mins) + 'h';
						// Calculate the target time
						target = Math.floor(Date.now() / 1000) + (mins * 60);
					}
				}

				this.log.debug(`Direction: ${direction} Battery-Time: ${string} Percent: ${percent} Energy: ${energy} Rest-Capacity: ${rest} DoD: ${dod}`);

				// Set remaining time
				await this.setStateChangedAsync('calculation.battery.remaining', { val: string, ack: true });

				// Set target of the remaining time
				await this.setStateChangedAsync('calculation.battery.remaining_target', { val: target, ack: true });

				// Set target of the remaining time in readable form
				await this.setStateChangedAsync('calculation.battery.remaining_target_DT', { val: this.getDateTime(target * 1000), ack: true });
			} else {
				this.log.warn(`Specified State for Battery-percent is invalid or NULL. Please check your configuration!`);
			}
		} else {
			this.log.warn(`The adapter could not find the state with ID '${globalConfig.calculation.battery.percent}' which is provided for battery calculation! Please review your configuration of the adapter!`);
		}
	}

	/**
	 * 
	 * @param {string} id 
	 * @param {object} obj 
	 * @param {object} state
	 * @param {number} value 
	 */
	calculateValue(id, obj, state, value) {
		if (obj.type == 'text') {
			// Check, if we have source options for text - Date
			if (obj.source_option != -1) {
				this.log.debug(`Source Option detected! ${obj.source_option} Generating DateString for ${state.ts} ${this.getTimeStamp(state.ts, obj.source_option)}`);
				let timeStamp = this.getTimeStamp(state.ts, obj.source_option);
				outputValues.values[id] = timeStamp;
				rawValues.values[id] = state.val;
				value = timeStamp;
			} else {
				switch (obj.source_display) {
					case 'href':
						outputValues.img_href[id] = state.val;
						rawValues.values[id] = state.val;
						value = state.val;
						break;
					case 'text':
						// Linebreak Option
						let strOutput;
						if (obj.linebreak > 0) {
							let splitOpt = new RegExp(`.{0,${obj.linebreak}}(?:\\s|$)`, 'g');
							let splitted = state.val.toString().match(splitOpt);
							strOutput = splitted.join('<br>');
						} else {
							strOutput = state.val;
						}
						outputValues.values[id] = strOutput;
						rawValues.values[id] = strOutput;
						value = strOutput;
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
							this.log.debug(`Threshold for: ${id} is: ${obj.threshold}`);

							// Check, if we have Subtractions for this value
							let subArray = obj.subtract;
							if (subArray != undefined && typeof (subArray) == 'object') {
								if (subArray.length > 0) {
									if (subArray[0] != -1) {
										subValue = subArray.reduce((acc, value) => acc - (rawValues.sourceValues[value]), 0);
										this.log.debug(`Subtracted by: ${subArray.toString()}`);
									}
								}
							}

							// Check, if we have Additions for this value
							let addArray = obj.add;
							if (addArray != undefined && typeof (addArray) == 'object') {
								if (addArray.length > 0) {
									if (addArray[0] != -1) {
										addValue = addArray.reduce((acc, value) => acc + (rawValues.sourceValues[value]), 0);
										this.log.debug(`Added to Value: ${addArray.toString()}`);
									}
								}
							}

							let formatValue = (Number(value) + Number(subValue) + Number(addValue));

							// Check if value is over threshold
							if (Math.abs(formatValue) >= obj.threshold) {
								// Convert Value to positive
								let cValue = obj.convert ? Math.abs(formatValue) : formatValue;
								// Calculation
								switch (obj.calculate_kw) {
									case 'calc':
									case true:
										// Convert to kW if set
										cValue = (Math.round((cValue / 1000) * 100) / 100);
										break;
									case 'auto':
										if (Math.abs(cValue) >= 1000000000) {
											outputValues.unit[id] = 'GW';
											// Convert to GW if set
											cValue = (Math.round((cValue / 1000000000) * 100) / 100);
										} else if (Math.abs(cValue) >= 1000000) {
											outputValues.unit[id] = 'MW';
											// Convert to MW if set
											cValue = (Math.round((cValue / 1000000) * 100) / 100);
										} else if (Math.abs(cValue) >= 1000) {
											outputValues.unit[id] = 'kW';
											// Convert to kW if set
											cValue = (Math.round((cValue / 1000) * 100) / 100);
										} else {
											outputValues.unit[id] = 'W';
										}
										break;
									case 'none':
									case false:
										break;
									default:
										cValue = cValue;
										break;
								}
								// Set decimal places
								cValue = obj.decimal_places >= 0 ? this.decimalPlaces(cValue, obj.decimal_places) : cValue;

								outputValues.values[id] = cValue;
							} else {
								outputValues.values[id] = obj.decimal_places >= 0 ? this.decimalPlaces(0, obj.decimal_places) : value;
							}
						}
						rawValues.values[id] = value;
						break;
				}
			}
		} else {
			// Element is not Text - It is Rect or Circle
			if (obj.fill_type != -1 && obj.fill_type) {
				outputValues.fillValues[id] = value;
			}
			if (obj.border_type != -1 && obj.border_type) {
				outputValues.borderValues[id] = value;
			}
		}
		// Overrides for elements
		if (obj.override) {
			this.getOverridesAsync(value, obj.override).then((response) => {
				outputValues.override[id] = response;
			});
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
					hour: 'numeric',
					minute: 'numeric',
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					second: '2-digit',
					hour12: false
				});
			case 'timestamp_de_short':
				return date.toLocaleString('de-DE', {
					hour: '2-digit',
					minute: '2-digit',
					day: '2-digit',
					month: '2-digit',
					year: '2-digit',
					hour12: false
				});
			case 'timestamp_de_short_wo_year':
				return date.toLocaleString('de-DE', {
					hour: '2-digit',
					minute: '2-digit',
					day: '2-digit',
					month: '2-digit',
					hour12: false
				});
			case 'timestamp_de_hhmm':
				return date.toLocaleString('de-DE', {
					hour: '2-digit',
					minute: '2-digit'
				});
			case 'timestamp_us':
				return date.toLocaleString('en-US', {
					hour: 'numeric',
					minute: 'numeric',
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					second: '2-digit',
					hour12: true
				});
			case 'timestamp_us_short':
				return date.toLocaleString('en-US', {
					hour: '2-digit',
					minute: '2-digit',
					day: '2-digit',
					month: '2-digit',
					year: '2-digit',
					hour12: true
				});
			case 'timestamp_us_short_wo_year':
				return date.toLocaleString('en-US', {
					hour: '2-digit',
					minute: '2-digit',
					day: '2-digit',
					month: '2-digit',
					hour12: true
				});
			case 'timestamp_us_hhmm':
				return date.toLocaleString('de-DE', {
					hour: '2-digit',
					minute: '2-digit',
					hour12: true
				});
			case 'relative':
				return this.msToTime(Number(now - date));
			case 'ms':
				return ts;
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
	 * @param {number} decimal_places
	 */
	decimalPlaces(value, decimal_places) {
		return Number(value).toFixed(decimal_places);
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
		// Correct dots, if maximum exceeded
		l_amount = l_amount > maxDots ? maxDots : l_amount;
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
	 * @param {number} condValue 
	 * @param {object} obj 
	 * @returns {Promise} tmpWorker
	 */
	async getOverridesAsync(condValue, obj) {
		return new Promise((resolve) => {
			let tmpWorker = {};
			const workObj = typeof (obj) === 'string' ? JSON.parse(obj) : JSON.parse(JSON.stringify(obj));

			if (workObj.hasOwnProperty(condValue)) {
				// Check, if Property exists - if yes, directly return it, because thats the best match
				tmpWorker = workObj[condValue];
			} else {
				// Property not found. We need to check the values!
				const operators = new RegExp('[=><!]');
				Object.keys(workObj)
					.sort(
						(a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' }))
					.forEach((item) => {
						if (operators.test(item)) {
							// Now, we need to check, if condValue is a number
							if (!isNaN(condValue)) {
								// Operator found - check for condition
								try {
									const func = Function(`return ${condValue}${item} `)();
									if (func) {
										tmpWorker = workObj[item];
									}
								}
								catch (func) {
									tmpWorker.error = {
										status: false,
										error: func.toString(),
										function: condValue + item
									}
								}
							}
						}
					});
			}

			if (Object.keys(tmpWorker).length == 0) {
				// Check, if we have a default fallback for it
				if (workObj.hasOwnProperty('default')) {
					tmpWorker = workObj['default'];
				}
			}

			// Now we process the found values inside tmpWorker Obj
			if (Object.keys(tmpWorker).length > 0) {
				Object.keys(tmpWorker).forEach(async item => {
					// Temp Storage of workerValue
					let itemToWorkWith = tmpWorker[item];

					// Check if we are not destroying the error object
					if (typeof itemToWorkWith != 'object') {
						itemToWorkWith = itemToWorkWith.toString();
						const dp_regex = /{([^}]+)}/g;
						const foundDPS = [...itemToWorkWith.matchAll(dp_regex)];
						if (foundDPS.length > 0) {
							for (const match of foundDPS) {
								// Check, if match contains min. 2 dots - then its a state
								const checkForState = match[1].match(/\./g);
								if (checkForState != null && checkForState.length >= 2) {
									const state = await this.getForeignStateAsync(match[1]);
									if (state) {
										if (state.val) {
											itemToWorkWith = itemToWorkWith.replace(match[0], state.val);
										}
									}
								}
							}
						}
					}

					try {
						const func = new Function(`return ${itemToWorkWith} `)();
						tmpWorker[item] = func(condValue);
					}
					catch (func) {
						tmpWorker[item] = itemToWorkWith;
					}
				});
			}
			resolve(tmpWorker);
		});
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
				// sourceObject for this state-id
				let soObj = sourceObject[id];

				// Correct the Value if not Number
				if (typeof (state.val) === 'string') {
					clearValue = Number(state.val.replace(/[^\d.-]/g, '')) * soObj.factor;
				} else {
					clearValue = state.val * soObj.factor;
				}

				// Put Value into RAW-Source-Values
				rawValues.sourceValues[soObj.id] = clearValue;

				// Loop through each addSource
				if (soObj.hasOwnProperty('addSources') && soObj['addSources'].length) {
					this.log.debug(`Updated through addSources: ${JSON.stringify(rawValues.sourceValues)} `);

					// Run through element addition to update the addition
					for (var _key of Object.keys(soObj.addSources)) {
						let src = soObj.addSources[_key];

						if (settingsObj.hasOwnProperty(src)) {
							this.log.debug(`Value-Settings for Element ${src} found! Applying Settings!`);
							this.calculateValue(src, settingsObj[src], state, rawValues.values[src]);
						}
					}
				}

				// Loop through each subtractSource
				if (soObj.hasOwnProperty('subtractSources') && soObj['subtractSources'].length) {
					this.log.debug(`Updated through subtractSources: ${JSON.stringify(rawValues.sourceValues)} `);

					// Run through element subtraction to update the subtraction
					for (var _key of Object.keys(soObj.subtractSources)) {
						let src = soObj.subtractSources[_key];

						if (settingsObj.hasOwnProperty(src)) {
							this.log.debug(`Value-Settings for Element ${src} found! Applying Settings!`);
							this.calculateValue(src, settingsObj[src], state, rawValues.values[src]);
						}
					}
				}

				// Loop through each Element, which belongs to that source
				if (soObj.hasOwnProperty('elmSources') && soObj['elmSources'].length) {
					this.log.debug(`Updated through sources: ${JSON.stringify(rawValues.sourceValues)} `);

					// Run through element sources to update the sources
					for (var _key of Object.keys(soObj.elmSources)) {
						let src = soObj.elmSources[_key];

						// Put ID into CSS-Rule for later use
						cssRules.push(src);

						if (settingsObj.hasOwnProperty(src)) {
							this.log.debug(`Value-Settings for Element ${src} found! Applying Settings!`);
							this.calculateValue(src, settingsObj[src], state, clearValue);
						}
					}
				}

				// Check, if that Source belongs to battery-charge or discharge, to determine the time
				if (globalConfig.hasOwnProperty('calculation')) {
					// Battery Remaining
					if (globalConfig.calculation.hasOwnProperty('battery')) {
						let batObj = globalConfig.calculation.battery;
						if (soObj.id == batObj.charge || soObj.id == batObj.discharge) {
							if (batObj.charge != -1 && batObj.charge != null && batObj.discharge != -1 && batObj.discharge != null && batObj.percent != -1 && batObj.percent != null) {
								let direction = 'none';
								let energy = 0;

								// Battery
								let batteryCharge = Math.abs(clearValue);
								let batteryDischarge = Math.abs(clearValue);

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
								this.calculateBatteryRemaining(direction, energy);
							}
						}
					}

					// Consumption calculation
					if (globalConfig.calculation.hasOwnProperty('consumption')) {
						let consObj = globalConfig.calculation.consumption;
						if (soObj.id == consObj.gridFeed || soObj.id == consObj.gridConsume || soObj.id == consObj.batteryCharge ||
							soObj.id == consObj.batteryDischarge || consObj.production.indexOf(soObj.id) >= 0) {
							if (consObj.production.indexOf(-1) != 0) {
								this.log.debug('Calculation for consumption should be possible!');

								// Calc all Production states
								let prodArray = consObj.production;
								let prodValue = 0;

								// Grid
								let gridFeed = rawValues.sourceValues[consObj.gridFeed];
								let gridConsume = rawValues.sourceValues[consObj.gridConsume];

								// Battery
								let batteryCharge = rawValues.sourceValues[consObj.batteryCharge];
								let batteryDischarge = rawValues.sourceValues[consObj.batteryDischarge];

								// Consumption
								let consumption = 0;

								// Battery Charge - via Grid or Solar
								let battChargeGrid = 0;
								let battChargeSolar = 0;

								// Production state(s)
								if (prodArray.length > 0) {
									for (var sub in prodArray) {
										if (prodArray[sub] != -1) {
											prodValue = prodValue + Math.abs(rawValues.sourceValues[prodArray[sub]]);
										}
									}
								}

								// Write production to state
								this.setProduction(prodValue);

								prodValue = prodValue;

								// Calculate Production
								consumption = prodValue;

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

										// Battery Charge - via Grid or Solar
										battChargeGrid = prodValue < Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
										battChargeSolar = prodValue > Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
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

											// Battery Charge - via Grid or Solar
											battChargeGrid = prodValue < Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
											battChargeSolar = prodValue > Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
										}
										if (!consObj.batteryDischarge_prop) {
											consumption = consumption + Math.abs(batteryDischarge);
										}
									}

									if (batteryCharge < 0) {
										if (consObj.batteryCharge_prop) {
											consumption = consumption - Math.abs(batteryCharge);

											// Battery Charge - via Grid or Solar
											battChargeGrid = prodValue < Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
											battChargeSolar = prodValue > Math.abs(batteryCharge) ? Math.abs(batteryCharge) : 0;
										}
										if (consObj.batteryDischarge_prop) {
											consumption = consumption + Math.abs(batteryDischarge);
										}
									}
								}

								// Battery Charge
								this.log.debug(`Battery Charging.Grid: ${battChargeGrid} | Solar: ${battChargeSolar}.ID: ${soObj.id} `);

								// Write battery to state
								this.setBatteryCharge(battChargeGrid, battChargeSolar);

								// Debug Log
								this.log.debug(`Current Values for calculation of consumption: Production: ${prodValue}, Battery: ${batteryCharge} / ${batteryDischarge} , Grid: ${gridFeed} / ${gridConsume} - Consumption: ${consumption} `);

								// Write consumption to state
								this.setConsumption(consumption);
							}
						}
					}
				}

				// Animations
				if (soObj.hasOwnProperty('elmAnimations')) {
					this.log.debug(`Found corresponding animations for ID: ${id} !Applying!`);
					for (var _key of Object.keys(soObj.elmAnimations)) {
						let src = soObj.elmAnimations[_key];
						// Object Variables
						let tmpType, tmpStroke, tmpDuration, tmpOption;

						// Put ID into CSS-Rule for later use
						cssRules.push(src);

						let tmpAnimValid = true;
						// Animations
						if (settingsObj.hasOwnProperty(src)) {
							this.log.debug(`Animation - Settings for Element ${src} found! Applying Settings!`);
							let seObj = settingsObj[src];

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
								this.getOverridesAsync(clearValue, seObj.override).then((response) => {
									outputValues.override[src] = response;
								});
								this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[src])} `);
							}

							// Overrides for Lines
							let line_id = src.replace('anim', 'line');
							if (settingsObj.hasOwnProperty(line_id)) {
								this.getOverridesAsync(clearValue, settingsObj[line_id].override).then((response) => {
									outputValues.override[line_id] = response;
								});
								this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[line_id])} `);
							}
						}
					}
				}

				// Put CSS together
				if (cssRules.length > 0) {
					cssRules.forEach((src) => {
						let seObj = settingsObj[src];
						let tmpCssRules = undefined;

						// CSS Rules
						if (seObj.source_type == 'boolean') {
							this.log.debug(`Setting for boolean ${JSON.stringify(seObj)} and ID: ${src} `);
							if (clearValue == 1) {
								tmpCssRules = {
									actPos: seObj.css_active_positive,
									inactPos: seObj.css_inactive_positive
								};
							}
							if (clearValue == 0) {
								tmpCssRules = {
									actPos: seObj.css_inactive_positive,
									inactPos: seObj.css_active_positive
								};
							}
						} else {
							if (seObj.threshold >= 0) {
								if (Math.abs(clearValue) > seObj.threshold) {
									// CSS Rules
									if (clearValue > 0) {
										// CSS Rules - Positive
										tmpCssRules = {
											actPos: seObj.css_active_positive,
											inactPos: seObj.css_inactive_positive,
											actNeg: undefined,
											inactNeg: seObj.css_active_negative
										};
									}
									if (clearValue < 0) {
										// CSS Rules - Negative
										tmpCssRules = {
											actNeg: seObj.css_active_negative,
											inactNeg: seObj.css_inactive_negative,
											actPos: undefined,
											inactPos: seObj.css_active_positive
										};
									}
								} else {
									// CSS Rules
									if (clearValue > 0) {
										// CSS Rules - Positive
										tmpCssRules = {
											actPos: seObj.css_inactive_positive,
											inactPos: seObj.css_active_positive,
											actNeg: undefined,
											inactNeg: seObj.css_active_negative
										};
									}
									if (clearValue < 0) {
										// CSS Rules - Negative
										tmpCssRules = {
											actNeg: seObj.css_inactive_negative,
											inactNeg: seObj.css_active_negative,
											actPos: undefined,
											inactPos: seObj.css_active_positive
										};
									}
									if (clearValue == 0) {
										// CSS Rules - Positive
										// Inactive Positive
										let inactPos = seObj.css_active_positive ? seObj.css_active_positive + ' ' : undefined;
										inactPos = seObj.css_inactive_positive ? inactPos + seObj.css_inactive_positive : inactPos;
										// Inactive Negative
										let inactNeg = seObj.css_active_negative ? seObj.css_active_negative + ' ' : undefined;
										inactNeg = seObj.css_inactive_negative ? inactNeg + seObj.css_inactive_negative : inactNeg;
										tmpCssRules = {
											actPos: undefined,
											inactPos: inactPos,
											actNeg: undefined,
											inactNeg: inactNeg
										};
									}
								}
							}
						}
						// Add to Output
						if (tmpCssRules !== undefined) {
							// Clean the rules
							Object.keys(tmpCssRules).forEach(key => tmpCssRules[key] === undefined && delete tmpCssRules[key]);

							if (Object.keys(tmpCssRules).length > 0) {
								outputValues.css[src] = tmpCssRules;
							}
						}
					});
				}

				this.log.debug(`State changed! New value for Source: ${id} with Value: ${clearValue} belongs to Elements: ${soObj.elmSources.toString()} `);

				// Build Output
				await this.setStateChangedAsync('data', { val: JSON.stringify(outputValues), ack: true });
			} else {
				this.log.warn(`State changed! New value for Source: ${id} with Value: ${clearValue} belongs to Elements, which were not found! Please check them!`);
			}
		}
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
			override: {},
			img_href: {}
		};
		rawValues = {
			values: {},
			sourceValues: {}
		};
		sourceObject = {};
		settingsObj = {};
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
			this.log.warn('This is the first time the adapter starts. Setting config to default (empty)!');
			globalConfig = {};
		}
		this.log.debug(JSON.stringify(globalConfig));

		// Collect all Datasources
		if (globalConfig.hasOwnProperty('datasources')) {
			for (var key of Object.keys(globalConfig.datasources)) {
				const value = globalConfig.datasources[key];
				this.log.debug(`Datasource: ${JSON.stringify(value)} `);
				if (value.source != '' && value.hasOwnProperty('source')) {
					try {
						const stateValue = await this.getForeignStateAsync(value.source);
						if (stateValue) {
							// Create sourceObject, for handling sources
							sourceObject[value.source] = {
								id: parseInt(key),
								factor: value.factor || 1,
								elmSources: [],
								elmAnimations: [],
								addSources: [],
								subtractSources: []
							};
							rawValues.sourceValues[key] = stateValue.val * sourceObject[value.source].factor;

							// Add to SubscribeArray
							subscribeArray.push(value.source);

							// Complete state for temporary use
							stateObject[value.source] = stateValue;
						} else {
							this.log.warn(`The adapter could not find the state '${value.source}'! Please review your configuration of the adapter!`);
						}
					} catch (error) {
						this.log.warn(`The adapter could not request the state '${value.source}'! The state seems to be deleted! Please review your configuration of the adapter!`);
					}
				}
			}
		}

		// Collect the Elements, which are using the sources
		if (globalConfig.hasOwnProperty('elements')) {
			for (var key of Object.keys(globalConfig.elements)) {
				const value = globalConfig.elements[key];
				// Normal sources via Datasources
				if (value.hasOwnProperty('source') && globalConfig.datasources.hasOwnProperty(value.source)) {
					if (sourceObject.hasOwnProperty(globalConfig.datasources[value.source].source)) {
						const objObject = await this.getForeignObjectAsync(globalConfig.datasources[value.source].source);
						if (objObject) {
							// Save Settings for each object
							settingsObj[key] = {
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

							// Put addition ID's into addition array
							if (value.add != undefined && typeof (value.add) == 'object') {
								if (value.add.length > 0) {
									for (var add in value.add) {
										if (value.add[add] != -1) {
											if (globalConfig.datasources.hasOwnProperty(value.add[add])) {
												sourceObject[globalConfig.datasources[value.add[add]].source].addSources.push(key);
											} else {
												this.log.warn(`The addition datasource with ID '${value.add[add]}' which is used in element '${key}' of type ${value.type
													} was not found! Please review your configuration of the adapter!`);
											}
										}
									}
								}
							}

							// Put subtract ID's into substraction array
							if (value.subtract != undefined && typeof (value.subtract) == 'object') {
								if (value.subtract.length > 0) {
									for (var subtract in value.subtract) {
										if (value.subtract[subtract] != -1) {
											if (globalConfig.datasources.hasOwnProperty(value.subtract[subtract])) {
												sourceObject[globalConfig.datasources[value.subtract[subtract]].source].subtractSources.push(key);
											} else {
												this.log.warn(`The subtraction datasource with ID '${value.subtract[subtract]}' which is used in element '${key}' of type ${value.type
													} was not found! Please review your configuration of the adapter!`);
											}
										}
									}
								}
							}
						}
					} else {
						this.log.warn(`State '${globalConfig.datasources[value.source].source}' which is used for element with ID ${key} of type ${value.type
							} is not available! Please review your configuration of the adapter!`);
					}
				}

				// Datasources for image href
				if (value.href != undefined) {
					if (value.href.length > 0) {
						const dp_regex = new RegExp('{([^)]+)\}');
						let hrefString = value.href.match(dp_regex);
						if (hrefString && hrefString.length > 0) {
							this.log.debug(`Using datasource '${hrefString[1]}' as href for image with ID ${key} `);

							// Create sourceObject, for handling sources
							sourceObject[hrefString[1]] = {
								id: parseInt(key),
								elmSources: [key]
							};

							const stateValue = await this.getForeignStateAsync(hrefString[1]);
							if (stateValue) {
								const objObject = await this.getForeignObjectAsync(hrefString[1]);
								settingsObj[key] = {
									source_display: 'href',
									source_type: objObject.common.type,
									source_option: -1,
									href: stateValue.val,
									type: 'text'
								};
							}

							// Add to SubscribeArray
							subscribeArray.push(hrefString[1]);

							// Complete state for temporary use
							stateObject[hrefString[1]] = stateValue;
						}
					}
				}
			}
		}

		// Animations
		if (globalConfig.hasOwnProperty('animations')) {
			for (var key of Object.keys(globalConfig.animations)) {
				const value = globalConfig.animations[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					this.log.debug(`Animation for Source: ${value.source} is: ${key} `);
					// Save Settings for each object
					settingsObj[key] = {
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
					if (sourceObject.hasOwnProperty(globalConfig.datasources[value.source].source)) {
						sourceObject[globalConfig.datasources[value.source].source].elmAnimations.push(key);
					} else {
						this.log.warn(`State '${globalConfig.datasources[value.source].source}' which is used as animation for '${key.replace('anim', 'line')}' is not available! Please review your configuration of the adapter!`);
					}

					// Check, if corresponding line has override properties as well
					let line_id = key.replace('anim', 'line');
					if (globalConfig.lines[line_id].hasOwnProperty('override')) {
						this.log.debug(`Found override for line ${line_id} in combination with Animation ${key} `);
						settingsObj[line_id] = {
							override: globalConfig.lines[line_id].override
						}
					}
				} else {
					this.log.debug(`Animation for Source: ${value.source} not found!`);
				}
			}
		}

		this.log.debug(`Settings: ${JSON.stringify(settingsObj)} `);
		this.log.debug(`Initial Values: ${JSON.stringify(outputValues.values)} `);
		this.log.debug(`Initial Fill - Values: ${JSON.stringify(outputValues.fillValues)} `);
		this.log.debug(`Sources: ${JSON.stringify(sourceObject)} `);
		this.log.debug(`States: ${JSON.stringify(stateObject)} `);
		this.log.debug(`RAW - Values: ${JSON.stringify(rawValues.values)} `);
		this.log.debug(`RAW - Source - Values: ${JSON.stringify(rawValues.sourceValues)} `);

		// Run once through all sources, to generate a proper output on startup
		for (var key of Object.keys(sourceObject)) {
			await this.refreshData(key, stateObject[key]);
			delete stateObject[key];
		}

		// Starting Timer
		if (Object.keys(relativeTimeCheck).length > 0) {
			this.log.info(`Found relative Date Texts(${Object.keys(relativeTimeCheck).length}) to display.Activating timer!`);
			this.log.debug(`Array for relative texts ${relativeTimeCheck} `);
			globalInterval = this.setInterval(() => {
				this.getRelativeTimeObjects(relativeTimeCheck);
			}, 10000);
		}

		this.log.info('Configuration loaded!');
		this.log.info(`Requesting the following states: ${subscribeArray.toString()} `);

		// Renew the subscriptions
		await this.subscribeForeignStatesAsync(subscribeArray);
	}

	async startServer() {
		function requestListener(req, res) {
			try {
				let query = url.parse(req.url, true).query;
				let callback = query.callback;
				let message;
				res.setHeader("Content-Type", "application/javascript");
				// Query for icon
				switch (query.serve) {
					case "icon":
						if (query.icon) {
							// Check, if icon is available in Cache
							if (iconCacheObject.hasOwnProperty(query.icon)) {
								iconCacheObject[query.icon].status = 'served via Cache';
								res.writeHead(200);
								res.end(`${callback}(${JSON.stringify(iconCacheObject[query.icon])})`);
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
												res.end(`${callback}(${JSON.stringify(iconCacheObject[query.icon])})`);
											} else {
												// Put Icon into cache
												iconCacheObject[query.icon] = {
													icon: error_icon,
													message: 'Icon not found!',
													status: 'served via Server'
												}
												res.writeHead(200);
												res.end(`${callback}(${JSON.stringify(iconCacheObject[query.icon])})`);
											}
											_this.log.debug(`Icon ${query.icon} served via: ${iconCacheObject[query.icon].status}`);
										} else {
											// Server down or not found
											res.writeHead(200);
											res.end(`${callback}(${JSON.stringify(error_icon)})`);
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