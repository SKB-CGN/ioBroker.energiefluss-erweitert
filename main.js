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
		_this = this;

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
					fs.writeFile(newFilePath, JSON.stringify(tmpBackup[key]), (err) => {
						if (err) {
							this.log.error(`Could not create Backup ${newFilePath}. Error: ${err}`);
						}
					});
				}
			}
			// After creation of new backup - delete the state
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
		this.delObjectAsync('backup');
		this.delObjectAsync('battery_remaining');

		this.log.info('Adapter started. Loading config!');

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
						const id = `tmp_${obj.message.id}`;
						const state = await this.getForeignStateAsync(obj.message.source);
						rawValues[id] = state.val;
						// Modify the source
						obj.message.source = id;

						if (state) {
							await this.calculateValue(id, obj.message, state);
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
								delete rawValues[id];
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
	 * Converts minutes to a string representation of hours and minutes.
	 *
	 * @param {number} mins - The number of minutes to convert.
	 * @return {string} The string representation of the hours and minutes.
	 */
	getMinHours(mins) {
		const m = mins % 60;
		const h = (mins - m) / 60;
		return (h < 10 ? '0' : '') + h.toString() + ':' + (m < 10 ? '0' : '') + m.toString();
	}

	/**
	 * 
	 * @param {string} id 
	 * @param {object} obj 
	 * @param {object} state
	 */
	async calculateValue(id, obj, state /* value */) {
		this.log.debug(`Values for: ${id} - Using source: ${obj.source} rawValue: ${rawValues[obj.source]} Settings: ${JSON.stringify(obj)}`);
		const sourceValue = globalConfig.datasources[obj.source] ? rawValues[obj.source] * globalConfig.datasources[obj.source].factor : rawValues[obj.source];

		// Decide, which type we have
		switch (obj.type) {
			case 'image':
				let tmpImg = await this.getForeignStateAsync(obj.href);
				outputValues.img_href[id] = tmpImg.val || '#';
				this.log.debug(`Loading Image for ${id} with: ${JSON.stringify(obj)} Result: ${outputValues.img_href[id]}`);
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
				if (obj.source_option != -1) {
					this.log.debug(`Source Option detected! ${obj.source_option} Generating DateString for ${state.ts} ${this.getTimeStamp(state.ts, obj.source_option)}`);
					let timeStamp = this.getTimeStamp(state.ts, obj.source_option);
					outputValues.values[id] = timeStamp;
				} else {
					switch (obj.source_display) {
						case 'text':
							// Linebreak Option
							let strOutput;
							if (obj.linebreak > 0 && state.val && state.val.length > 0) {
								let splitOpt = new RegExp(`.{0,${obj.linebreak}}(?:\\s|$)`, 'g');
								let splitted = state.val.toString().match(splitOpt);
								strOutput = splitted.join('<br>');
							} else {
								strOutput = state.val;
							}
							outputValues.values[id] = strOutput;
							break;

						case 'bool':
							outputValues.values[id] = sourceValue ? systemDictionary['on'][systemLang] : systemDictionary['off'][systemLang];
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
									subValue = subArray.reduce((acc, idx) => acc - (rawValues[idx] * globalConfig.datasources[idx].factor || 0), 0);
									this.log.debug(`Subtracted by: ${subArray.toString()}`);
								}

								// Check, if we have Additions for this value
								const addArray = obj.add;
								let addValue = 0;
								if (Array.isArray(addArray) && addArray.length > 0 && addArray[0] != -1) {
									addValue = addArray.reduce((acc, idx) => acc + (rawValues[idx] * globalConfig.datasources[idx].factor || 0), 0);
									this.log.debug(`Added to Value: ${addArray.toString()}`);
								}

								let formatValue = (Number(sourceValue) + Number(subValue) + Number(addValue));

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

									outputValues.values[id] = obj.decimal_places >= 0 ? this.decimalPlaces(cValue, obj.decimal_places) : cValue;
								} else {
									outputValues.values[id] = obj.decimal_places >= 0 ? this.decimalPlaces(0, obj.decimal_places) : sourceValue;
								}
							}
							break;
					}
				}
				break;
		}

		// Overrides for elements
		if (obj.override) {
			this.log.debug(`Gathering override for ID: ${id}, Value: ${sourceValue} and Override: ${JSON.stringify(obj.override)}`);
			outputValues.override[id] = await this.getOverridesAsync(sourceValue, obj.override);
		}
	}

	/**
	 * Converts a duration in milliseconds to a human-readable time string.
	 *
	 * @param {number} duration - The duration in milliseconds.
	 * @return {string} The human-readable time string.
	 */
	msToTime(duration) {
		const seconds = Math.floor((duration / 1000) % 60);
		const minutes = Math.floor((duration / (1000 * 60)) % 60);
		const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
		let value = systemDictionary['timer_now'][systemLang];

		if (hours > 0) {
			if (hours < 5 && hours >= 2) {
				value = systemDictionary['timer_few_hours'][systemLang];;
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
	 * @param {string} format - The format string with `%s` placeholders.
	 * @return {string} The formatted string with placeholders replaced by the corresponding values.
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
	 * @param {number} ts - The timestamp in milliseconds.
	 * @param {string} mode - The mode to determine the format of the timestamp.
	 * @return {string} The formatted timestamp.
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
				const now = new Date();
				return this.msToTime(now - date);
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
		if (!ts || ts <= 0) {
			return '';
		}

		const date = new Date(ts);
		let day = '0' + date.getDate();
		let month = '0' + (date.getMonth() + 1);
		let year = date.getFullYear();
		let hours = '0' + date.getHours();
		let minutes = '0' + date.getMinutes();
		let seconds = '0' + date.getSeconds();
		return day.substr(-2) + '.' + month.substr(-2) + '.' + year + ' ' + hours.substr(-2) + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	/**
	 * Asynchronously retrieves the relative time objects for the given object.
	 *
	 * @param {Object} obj - The object containing the keys and their corresponding source and option properties.
	 * @return {Promise<void>} A promise that resolves once all relative time objects have been retrieved and assigned.
	 */
	async getRelativeTimeObjects(obj) {
		const keys = Object.keys(obj);
		const promises = keys.map(async (key) => {
			const stateValue = await this.getForeignStateAsync(obj[key].source);
			if (stateValue) {
				outputValues.values[key] = this.getTimeStamp(stateValue.ts, obj[key].option);
			}
		});

		await Promise.all(promises);
	}

	/**
	 * Returns a string representation of a number with the specified number of decimal places.
	 *
	 * @param {number} value - The number to be converted to a string.
	 * @param {number} decimal_places - The number of decimal places to include in the string representation.
	 * @return {string} A string representation of the number with the specified number of decimal places.
	 */
	decimalPlaces(value, decimal_places) {
		return Number(value).toFixed(decimal_places);
	}


	/**
	 * Calculates the duration based on the maximum duration, maximum power, and current power.
	 *
	 * @param {number} maxDuration - The maximum duration.
	 * @param {number} maxPower - The maximum power.
	 * @param {number} currentPower - The current power.
	 * @return {number} The calculated duration, limited to a maximum of 60000.
	 */
	calculateDuration(maxDuration, maxPower, currentPower) {
		// Max Duration
		let cur = Number(currentPower);
		let max = Number(maxPower);
		let dur = Number(maxDuration);

		// Calculate the result and limit it to 60000 if necessary
		return Math.min(Math.round((max / cur) * dur), 60000);
	}

	/**
	 * Calculates the stroke dash array for an SVG path element based on the maximum number of dots, maximum power, and current power.
	 *
	 * @param {number} maxDots - The maximum number of dots to be drawn.
	 * @param {number} maxPower - The maximum power.
	 * @param {number} currentPower - The current power.
	 * @return {string} The stroke dash array for the SVG path element.
	 */

	calculateStrokeArray(maxDots, maxPower, currentPower) {
		const totalLength = 136;
		const l_distance = globalConfig.animation_configuration.distance;
		const l_length = globalConfig.animation_configuration.length;

		// Calculate the number of dots to be drawn
		let l_amount = Math.round(((currentPower / maxPower) * maxDots));
		l_amount = Math.min(l_amount, maxDots);

		// Initialize stroke dash array
		let strokeDash = '';
		let total = totalLength;

		if (l_amount > 0 && l_length > 0 && l_distance > 0) {
			for (let i = 0; i < l_amount; i++) {
				strokeDash += `${l_length} `;
				if (i !== l_amount - 1) {
					strokeDash += `${l_distance} `;
					total -= l_distance;
				}
				total -= l_length;
			}
			strokeDash += ` ${total < 0 ? l_distance : total}`;
		} else {
			strokeDash = `${l_length} ${totalLength - l_length}`;
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
		return new Promise(async (resolve) => {
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
				for (var item of Object.keys(tmpWorker)) {
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
				}
			}
			resolve(tmpWorker);
		});
	}

	/**
	 * @param {string} id	ID of the state
	 * @param {object} state	State itself
	 */
	async refreshData(id, state) {
		if (id == this.namespace + '.configuration') {
			this.log.info('Configuration changed via Workspace! Reloading config!');
			this.getConfig();
		} else {
			//let clearValue;
			let cssRules = new Array();

			// Check, if we handle this source inside our subscribtion
			if (sourceObject.hasOwnProperty(id)) {
				// sourceObject for this state-id
				const soObj = sourceObject[id];

				// Number for calculation
				const stateValue = state.val;
				const calcNumber = (typeof (state.val) === 'string' ? Number(state.val.replace(/[^\d.-]/g, '')) : state.val) * soObj.factor;

				// Check, if the value has been updated - if not, dont refresh it
				this.log.debug(`Current Value of ${id}: ${stateValue} - saved Value: ${rawValues[soObj.id]}`);
				if (stateValue == rawValues[soObj.id]) {
					this.log.debug(`Value of ${id} did not change. Ignoring!`);
				} else {
					this.log.debug(`Value of ${id} changed! Processing!`);

					// Put Value into RAW-Source-Values
					rawValues[soObj.id] = stateValue;

					// Runner for calculating the values
					const sourceRunner = async (what) => {
						this.log.debug(`Updated through ${what}: ${JSON.stringify(rawValues)}`);

						// Run through the provided object
						for (const key of Object.keys(soObj[what])) {

							const elmID = soObj[what][key];

							if (what == 'elmSources') {
								// Put ID into CSS-Rule for later use
								cssRules.push(elmID);
							}

							if (settingsObj.hasOwnProperty(elmID)) {
								this.log.debug(`Value-Settings for Element ${elmID} found! Applying Settings!`);
								await this.calculateValue(elmID, settingsObj[elmID], state);
							}
						}
					};

					// Loop through each addSource
					if (soObj.hasOwnProperty('addSources') && soObj['addSources'].length) {
						await sourceRunner('addSources');
					}

					// Loop through each subtractSource
					if (soObj.hasOwnProperty('subtractSources') && soObj['subtractSources'].length) {
						await sourceRunner('subtractSources');
					}

					// Loop through each Element, which belongs to that source
					if (soObj.hasOwnProperty('elmSources') && soObj['elmSources'].length) {
						await sourceRunner('elmSources');
					}

					// Check, if that Source belongs to battery-charge or discharge, to determine the time
					if (globalConfig.hasOwnProperty('calculation')) {
						// Check, if the provided source is a valied source
						const isValidDatasource = (value) => {
							if (value === null || value === undefined || value === '') {
								return false;
							}

							// Überprüfen, ob der Wert vom Typ 'number' ist
							if (typeof value !== 'number') {
								return false;
							}

							// Überprüfen, ob der Wert größer oder gleich 0 ist
							return !isNaN(value) && Number(value) >= 0;
						};

						// Battery Remaining
						if (globalConfig.calculation.hasOwnProperty('battery')) {
							const batObj = globalConfig.calculation.battery;
							const isRelevantId = soObj.id == batObj.charge || soObj.id == batObj.discharge;

							if (isRelevantId && isValidDatasource(batObj.charge) && isValidDatasource(batObj.discharge) && isValidDatasource(batObj.percent)) {
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
								this.getForeignStateAsync(globalConfig.datasources[batObj.percent].source).then(state => {
									const capacity = isValidDatasource(batObj.capacity) ? rawValues[batObj.capacity] * globalConfig.datasources[batObj.capacity].factor : 0;
									const dod = isValidDatasource(batObj.dod) ? rawValues[batObj.dod] * globalConfig.datasources[batObj.dod].factor : 0;
									const percent = state.val;

									let rest = 0;
									let mins = 0;
									let string = '--:--h';
									let target = 0;
									const batt_energy = (capacity * (percent - dod)) / 100 || 0;

									if (percent > 0 && energy > 0) {
										if (direction === 'charge') {
											rest = capacity - ((capacity * percent) / 100);
										} else if (direction === 'discharge') {
											rest = (capacity * (percent - dod)) / 100;
										}

										mins = Math.round((rest / energy) * 60);
										if (mins > 0) {
											string = this.getMinHours(mins) + 'h';
											target = Math.floor(Date.now() / 1000) + (mins * 60);
										}
									}

									this.log.debug(`Direction: ${direction} Time to fully ${direction}: ${string} Percent: ${percent} Energy: ${energy} Rest Energy to ${direction}: ${rest} DoD: ${dod}`);

									// Set the states
									this.setStateChangedAsync('calculation.battery.remaining_energy', { val: batt_energy, ack: true });
									this.setStateChangedAsync('calculation.battery.remaining', { val: string, ack: true });
									this.setStateChangedAsync('calculation.battery.remaining_target', { val: target, ack: true });
									this.setStateChangedAsync('calculation.battery.remaining_target_DT', { val: this.getDateTime(target * 1000), ack: true });

								}).catch(e => {
									this.log.warn(`Calculation for battery-remaining failed! Error: ${e}`);
								});
							}
						}

						// Consumption calculation
						if (globalConfig.calculation.hasOwnProperty('consumption')) {
							const consObj = globalConfig.calculation.consumption;
							const { gridFeed, gridConsume, batteryCharge, batteryDischarge, production } = consObj;
							const isRelevantId = soObj.id == gridFeed || soObj.id == gridConsume || soObj.id == batteryCharge || soObj.id == batteryDischarge || production.includes(soObj.id);

							if (isRelevantId && production.indexOf(-1) !== 0) {
								this.log.debug('Calculation for consumption should be possible!');

								// Calc all Production states
								const prodArray = consObj.production;
								let prodValue = 0;

								this.log.debug(`[Calculation] Datasources GridFeed: ${consObj.gridFeed}, GridConsume: ${consObj.gridConsume} | Optional: BatteryCharge: ${consObj.batteryCharge}, BatteryDischarge: ${consObj.batteryDischarge}`);
								this.log.debug(`[Calculation] RAW-Values GridFeed: ${rawValues[consObj.gridFeed]}, GridConsume: ${Math.abs(rawValues[consObj.gridConsume])} | Optional: BatteryCharge: ${rawValues[consObj.batteryCharge]}, BatteryDischarge: ${Math.abs(rawValues[consObj.batteryDischarge])}`);

								// Grid
								const gridFeed = isValidDatasource(consObj.gridFeed) ? rawValues[consObj.gridFeed] * globalConfig.datasources[consObj.gridFeed].factor : 0;
								const gridConsume = isValidDatasource(consObj.gridConsume) ? Math.abs(rawValues[consObj.gridConsume] * globalConfig.datasources[consObj.gridConsume].factor) : 0;

								// Battery
								const batteryCharge = isValidDatasource(consObj.batteryCharge) ? rawValues[consObj.batteryCharge] * globalConfig.datasources[consObj.batteryCharge].factor : 0;
								const batteryDischarge = isValidDatasource(consObj.batteryDischarge) ? Math.abs(rawValues[consObj.batteryDischarge] * globalConfig.datasources[consObj.batteryDischarge].factor) : 0;


								this.log.debug(`[Calculation] Consumption. GridFeed: ${gridFeed}, GridConsume: ${gridConsume} | Optional: BatteryCharge: ${batteryCharge}, BatteryDischarge: ${batteryDischarge}`);

								// Consumption
								let consumption = 0;

								// Battery Charge - via Grid or Solar
								let battChargeGrid = 0;
								let battChargeSolar = 0;

								// Production state(s)
								prodValue = prodArray.reduce((sum, id) => sum + (id !== -1 ? Math.abs(rawValues[id] * globalConfig.datasources[id].factor) : 0), 0);

								// Write production to state
								this.setStateChangedAsync('calculation.production.production', { val: prodValue, ack: true });

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
								this.log.debug(`Battery Charging.Grid: ${battChargeGrid} | Solar: ${battChargeSolar}. ID: ${soObj.id} `);

								// Write battery to state
								this.setStateChangedAsync('calculation.battery.charging_grid', { val: battChargeGrid, ack: true });
								this.setStateChangedAsync('calculation.battery.charging_solar', { val: battChargeSolar, ack: true });

								// Debug Log
								this.log.debug(`Current Values for calculation of consumption: Production: ${prodValue}, Battery: ${batteryCharge} / ${batteryDischarge} , Grid: ${gridFeed} / ${gridConsume} - Consumption: ${consumption} `);

								// Write consumption to state
								this.setStateChangedAsync('calculation.consumption.consumption', { val: consumption, ack: true });
							}
						}
					}

					// Animations
					if (soObj.hasOwnProperty('elmAnimations')) {
						this.log.debug(`Found corresponding animations for ID: ${id} !Applying!`);
						for (const _key of Object.keys(soObj.elmAnimations)) {
							const src = soObj.elmAnimations[_key];

							// Object Variables
							let tmpType, tmpStroke, tmpDuration, tmpOption;

							// Put ID into CSS-Rule for later use
							cssRules.push(src);

							let tmpAnimValid = true;

							// Animations
							if (settingsObj.hasOwnProperty(src)) {
								this.log.debug(`Animation - Settings for Element ${src} found! Applying Settings!`);
								const seObj = settingsObj[src];

								if (seObj.type != -1 && seObj != undefined) {
									if (seObj.type == 'dots') {
										tmpType = 'dots';
										tmpStroke = this.calculateStrokeArray(seObj.dots, seObj.power, Math.abs(calcNumber));
									}
									if (seObj.type == 'duration') {
										tmpType = 'duration';
										tmpDuration = this.calculateDuration(seObj.duration, seObj.power, Math.abs(calcNumber));
									}
								}

								const handleAnimation = (thresholdCheck, option) => {
									if (thresholdCheck) {
										this.log.debug(`Value: ${calcNumber} is greater than Threshold: ${seObj.threshold}. Applying Animation!`);
										tmpAnimValid = true;
										tmpOption = option;
									} else {
										this.log.debug(`Value: ${calcNumber} is smaller than Threshold: ${seObj.threshold}. Deactivating Animation!`);
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
									outputValues.override[src] = await this.getOverridesAsync(calcNumber, seObj.override);
									this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[src])} `);
								}

								// Overrides for Lines
								let line_id = src.replace('anim', 'line');
								if (settingsObj.hasOwnProperty(line_id)) {
									outputValues.override[line_id] = await this.getOverridesAsync(calcNumber, settingsObj[line_id].override);
									this.log.debug(`Overrides: ${JSON.stringify(outputValues.override[line_id])} `);
								}
							}
						}
					}

					// Put CSS together
					if (cssRules.length > 0) {
						cssRules.forEach((src) => {
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
											updateTmpCssRules(seObj.css_active_positive, seObj.css_inactive_positive, undefined, seObj.css_active_negative);
										}
										if (calcNumber < 0) {
											// CSS Rules - Negative
											updateTmpCssRules(undefined, seObj.css_active_positive, seObj.css_active_negative, seObj.css_inactive_negative);
										}
									} else {
										// CSS Rules
										if (calcNumber > 0) {
											// CSS Rules - Positive
											updateTmpCssRules(seObj.css_inactive_positive, seObj.css_active_positive, undefined, seObj.css_active_negative);
										}
										if (calcNumber < 0) {
											// CSS Rules - Negative
											updateTmpCssRules(undefined, seObj.css_active_positive, seObj.css_inactive_negative, seObj.css_active_negative);
										}
										if (calcNumber == 0) {
											// CSS Rules - Positive
											// Inactive Positive
											let inactPos = seObj.css_active_positive ? seObj.css_active_positive + ' ' : undefined;
											inactPos = seObj.css_inactive_positive ? inactPos + seObj.css_inactive_positive : inactPos;

											// Inactive Negative
											let inactNeg = seObj.css_active_negative ? seObj.css_active_negative + ' ' : undefined;
											inactNeg = seObj.css_inactive_negative ? inactNeg + seObj.css_inactive_negative : inactNeg;
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

					this.log.debug(`State changed! New value for Source: ${id} with Value: ${stateValue} belongs to Elements: ${soObj.elmSources.toString()} `);

					// Build Output
					this.setStateChangedAsync('data', { val: JSON.stringify(outputValues), ack: true });
				}
			} else {
				this.log.warn(`State changed! New value for Source: ${id} belongs to Elements, which were not found! Please check them!`);
			}
		}
	}

	/**
	 * Retrieves the configuration data, processes it, and sets up necessary subscriptions and objects for further operations.
	 *
	 * @return {Promise<void>} Promise that resolves once the configuration setup is complete.
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
			animationProperties: {},
			prepend: {},
			append: {},
			css: {},
			override: {},
			img_href: {}
		};
		rawValues = {};
		sourceObject = {};
		settingsObj = {};
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
			for (const key of Object.keys(globalConfig.datasources)) {
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

							// Add to SubscribeArray
							subscribeArray.push(value.source);
						} else {
							this.log.warn(`The adapter could not find the state '${value.source}' used as datasource! Please review your configuration of the adapter!`);
						}
					} catch (error) {
						this.log.warn(`The adapter could not request the state '${value.source}'! The state seems to be deleted! Please review your configuration of the adapter!`);
					}
				}
			}
		}

		// Collect the Elements, which are using the sources
		if (globalConfig.hasOwnProperty('elements')) {
			for (const key of Object.keys(globalConfig.elements)) {
				const value = globalConfig.elements[key];
				// Normal sources via Datasources
				if (value.hasOwnProperty('source') && globalConfig.datasources.hasOwnProperty(value.source)) {
					const gDataSource = globalConfig.datasources[value.source];
					if (sourceObject.hasOwnProperty(gDataSource.source)) {
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
								text: value.text,
								linebreak: value.linebreak
							};

							// Append and prepend
							outputValues.append[key] = value.append;
							outputValues.prepend[key] = value.prepend;

							// Unit
							outputValues.unit[key] = value.unit;

							// Put into timer object for re-requesting
							if (value.source_option == 'relative') {
								relativeTimeCheck[key] = {
									source: gDataSource.source,
									option: value.source_option
								}
							}

							// Put elment ID into Source
							sourceObject[gDataSource.source].elmSources.push(parseInt(key));

							// Put addition ID's into addition array
							if (value.add && typeof value.add === 'object') {
								const addArray = value.add;
								if (addArray.length > 0) {
									for (const add of addArray) {
										if (add !== -1) {
											const dataSource = globalConfig.datasources[add];
											if (sourceObject.hasOwnProperty(dataSource.source)) {
												sourceObject[dataSource.source].addSources.push(parseInt(key));
											} else {
												this.log.warn(`The addition datasource with ID '${add}' which is used in element '${key}' of type ${value.type} was not found! Please review your configuration of the adapter!`);
											}
										}
									}
								}
							}

							// Put subtract ID's into subtraction array
							if (value.subtract && typeof value.subtract === 'object') {
								const subtractArray = value.subtract;
								if (subtractArray.length > 0) {
									for (const subtract of subtractArray) {
										if (subtract !== -1) {
											const dataSource = globalConfig.datasources[subtract];
											if (sourceObject.hasOwnProperty(dataSource.source)) {
												sourceObject[dataSource.source].subtractSources.push(parseInt(key));
											} else {
												this.log.warn(`The subtraction datasource with ID '${subtract}' which is used in element '${key}' of type ${value.type} was not found! Please review your configuration of the adapter!`);
											}
										}
									}
								}
							}
						}
					} else {
						this.log.warn(`State '${gDataSource.source}' which is used for element with ID ${key} of type ${value.type} is not available! Please review your configuration of the adapter!`);
					}
				}

				// Datasources for image href
				if (value.href != undefined && value.href.length > 0) {
					const dp_regex = new RegExp('{([^)]+)\}');
					let hrefString = value.href.match(dp_regex);
					if (hrefString && hrefString.length > 0) {
						this.log.debug(`Using datasource '${hrefString[1]}' as href for image with ID ${key} `);
						const stateValue = await this.getForeignStateAsync(hrefString[1]);
						if (stateValue) {
							// Check, if we use it already inside elements
							if (settingsObj.hasOwnProperty(key)) {
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
									css_inactive_negative: value.css_inactive_negative
								}
							}
							this.log.debug(`Href: ${value.href} Key: ${key} Object: ${JSON.stringify(settingsObj[key])}`);


							// Create sourceObject, for handling sources
							if (sourceObject.hasOwnProperty(hrefString[1])) {
								sourceObject[hrefString[1]].elmSources.push(key);
							} else {
								sourceObject[hrefString[1]] = {
									id: hrefString[1],
									elmSources: [key]
								};

								// Add to SubscribeArray
								subscribeArray.push(hrefString[1]);
							}
						} else {
							this.log.warn(`State '${hrefString[1]}' which is used for element with ID ${key} of type ${value.type} is not available! Please review your configuration of the adapter!`);
						}
					}
				}
			}
		}

		// Animations
		if (globalConfig.hasOwnProperty('animations')) {
			for (const key of Object.keys(globalConfig.animations)) {
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

					const dataSource = globalConfig.datasources[value.source];

					// Put Animation into Source
					if (sourceObject.hasOwnProperty(dataSource.source)) {
						sourceObject[dataSource.source].elmAnimations.push(key);
					} else {
						this.log.warn(`State '${dataSource.source}' which is used as animation for '${key.replace('anim', 'line')}' is not available! Please review your configuration of the adapter!`);
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

		// Run once through all sources, to generate a proper output on startup
		for (const key of Object.keys(sourceObject)) {
			const tmpSource = await this.getForeignStateAsync(key);
			this.log.debug(`Loading initial for ${key} with ${JSON.stringify(tmpSource)}`);
			await this.refreshData(key, tmpSource);
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