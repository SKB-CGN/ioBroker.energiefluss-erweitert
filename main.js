'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

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
	fillValues: {}
};

let relativeTimeCheck = {};
let globalInterval;

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
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		await this.setObjectNotExistsAsync('configuration', {
			type: 'state',
			common: {
				name: 'Parameters for HTML Output',
				type: 'json',
				role: 'state',
				read: true,
				write: false,
				def: '{}'
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('data', {
			type: 'state',
			common: {
				name: 'Data for HTML Output',
				type: 'json',
				role: 'state',
				read: true,
				write: false,
			},
			native: {},
		});

		this.log.info("Adapter started and loading config!");

		this.getConfig();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			clearInterval(globalInterval);
			this.log.info('Cleared interval for relative values!');
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		let clearValue;
		if (state) {
			// The state was changed
			if (id == this.namespace + '.configuration') {
				this.log.info('Configuration changed via Workspace! Reloading config!');
				this.getConfig();
			} else {
				if (typeof (state.val) === 'string') {
					clearValue = Number(state.val.replace(/[^\d.-]/g, ''));
				} else {
					clearValue = state.val;
				}

				// Put Value into RAW-Source-Values
				rawValues.sourceValues[sourceObject[id].id] = clearValue;
				this.log.debug(JSON.stringify(rawValues.sourceValues));

				// Loop through each Element, which belongs to that source
				if (sourceObject[id].hasOwnProperty('elmSources')) {
					for (var _key of Object.keys(sourceObject[id].elmSources)) {
						let src = sourceObject[id].elmSources[_key];
						// VALUES
						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Settings for Element " + src + " found! Applying Settings!")
							// Convertible
							let seObj = settingsObject[src];
							if (seObj.type == 'text') {
								// Check, if we have source options for text - Date
								if (seObj.source_option != -1) {
									this.log.debug('Source Option detected! ' + seObj.source_option + 'Generating DateString for ' + state.ts + ' ' + this.getDateTime(state.ts, seObj.source_option));
									outputValues.values[src] = this.getDateTime(state.ts, seObj.source_option);
									outputValues.unit[src] = '';
									rawValues.values[src] = 0;
								} else {
									if (seObj.threshold >= 0) {
										let threshold = seObj.threshold;
										let formatValue;
										this.log.debug('Threshold for: ' + src + ' is: ' + seObj.threshold);
										// Check, if value is over threshold
										if (clearValue > threshold || clearValue < threshold * -1) {
											// Check, if we have Subtractions for this value
											let subArray = seObj.subtract;
											if (subArray.length > 0) {
												let tmpVal = 0;
												for (var sub in subArray) {
													if (subArray[sub] != -1) {
														tmpVal = tmpVal + rawValues.sourceValues[subArray[sub]];
														this.log.debug("Subtracted by: " + subArray.toString());
													}
												}
												formatValue = clearValue - (tmpVal);
											} else {
												formatValue = clearValue;
											}
											// Format Value
											outputValues.values[src] = this.valueOutput(src, formatValue);
										} else {
											outputValues.values[src] = seObj.decimal_places >= 0 ? this.decimalPlaces(clearValue, seObj.decimal_places) : clearValue;
										}
										rawValues.values[src] = clearValue;
									}
								}
							} else {
								outputValues.fillValues[src] = clearValue;
							}
						} else {
							outputValues.values[src] = clearValue;
							rawValues.values[src] = clearValue;
						}
					}
				}

				// Animations
				if (sourceObject[id].hasOwnProperty('elmAnimations')) {
					this.log.debug('Found corresponding animations for ID: ' + id + '! Applying!');
					for (var anim in sourceObject[id].elmAnimations) {
						let animation = sourceObject[id].elmAnimations[anim];
						this.log.debug('Checking for Animation: ' + animation);
						let animationValid = true;
						let threshold = sourceObject[id].animationThreshold[anim];
						// Check, if we have a special Animation Set for this
						if (sourceObject[id].animationType[anim] != -1 && sourceObject[id].animationType[anim] != undefined) {
							this.log.debug("Found animation " + sourceObject[id].animationType[anim]);
							// Dots
							if (sourceObject[id].animationType[anim] == 'dots') {
								// Calculate new Amount or Dots
								this.log.debug('Stroke for animation: ' + animation + ' is: ' + this.calculateStrokeArray(sourceObject[id].animationDots, sourceObject[id].animationPower, clearValue) +
									' means: maxDots:  ' + sourceObject[id].animationDots + ' maxPower: ' + sourceObject[id].animationPower + ' Value: ' + clearValue);
								outputValues.animationProperties[animation] = {
									type: 'dots',
									stroke: this.calculateStrokeArray(sourceObject[id].animationDots, sourceObject[id].animationPower, clearValue)
								};
							}

							// Duration
							if (sourceObject[id].animationType[anim] == 'duration') {
								this.log.debug('Stroke for animation: ' + animation + ' is: ' + this.calculateDuration(sourceObject[id].animationDuration, sourceObject[id].animationPower, clearValue) +
									' means: minDuration:  ' + sourceObject[id].animationDuration + ' maxPower: ' + sourceObject[id].animationPower + ' Value: ' + clearValue);
								outputValues.animationProperties[animation] = {
									type: 'duration',
									duration: this.calculateDuration(sourceObject[id].animationDuration, sourceObject[id].animationPower, clearValue)
								};
							}

						}
						switch (sourceObject[id].animationProperties[anim]) {
							case 'positive':
								this.log.debug('Animation has a positive factor!');
								if (clearValue > 0) {
									if (clearValue > threshold) {
										this.log.debug('Value: ' + clearValue + ' is greater than Threshold: ' + threshold + ' Applying Animation!');
										animationValid = true;
									} else {
										this.log.debug('Value: ' + clearValue + ' is smaller than Threshold: ' + threshold + ' Deactivating Animation!');
										animationValid = false;
									}
								} else {
									animationValid = false;
								}
								break;
							case 'negative':
								this.log.debug('Animation has a negative factor!');
								if (clearValue < 0) {
									if (clearValue < threshold * -1) {
										this.log.debug('Value: ' + clearValue + ' is greater than Threshold: ' + threshold * -1 + ' Applying Animation!');
										animationValid = true;
									} else {
										this.log.debug('Value: ' + clearValue + ' is smaller than Threshold: ' + threshold * -1 + ' Deactivating Animation!');
										animationValid = false;
									}
								} else {
									animationValid = false;
								}
								break;
						}
						outputValues.animations[animation] = animationValid;
					}
				}

				this.log.debug('State changed! New value for Source: ' + id + ' with Value: ' + clearValue + ' belongs to Elements: ' + sourceObject[id].elmSources.toString());

				// Build Output
				this.buildData();
			}
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }
	/**
		 * @param {number} src
		 * @param {number} value
	*/
	valueOutput(src, value) {
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
		 * @param {number} duration
	*/
	msToTime(duration) {
		var seconds = Math.floor((duration / 1000) % 60),
			minutes = Math.floor((duration / (1000 * 60)) % 60),
			hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
			value = 'just now';

		if (seconds > 0) {
			if (seconds < 5 && seconds > 2) {
				value = 'a few seconds ago';
			} else if (seconds == 1) {
				value = seconds + ' second ago';
			} else {
				value = seconds + ' seconds ago'
			}
		}

		if (minutes > 0) {
			if (minutes < 5 && minutes > 2) {
				value = 'a few minutes ago';
			} else if (minutes == 1) {
				value = minutes + ' minute ago';
			} else {
				value = minutes + ' minutes ago'
			}
		}

		if (hours > 0) {
			if (hours < 5 && hours > 2) {
				value = 'a few hours ago';
			} else if (hours == 1) {
				value = hours + ' hour ago';
			} else {
				value = hours + ' hours ago';
			}
		}
		return value;
	}
	/**
		 * @param {number} ts
		 * @param {string} mode
	*/

	getDateTime(ts, mode) {
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
			case 'relative':
				return this.msToTime(Number(now - date));
		}
	}

	async getRelativeTimeObjects(obj) {
		for (var key of Object.keys(obj)) {
			const stateValue = await this.getForeignStateAsync(obj[key].source);
			if (stateValue) {
				outputValues.values[key] = this.getDateTime(stateValue.ts, obj[key].option);
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
		return (Number(value).toFixed(decimal_places));
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
		let dur = Number(maxDuration);
		let pwr = Number(maxPower - currentPower);

		return pwr > 0 ? dur + pwr : dur;

		//Math.round((((currentPower / maxPower) * 100) * maxDuration) / 100);
	}

	/**
	 * @param {number} maxDots
	 * @param {number} maxPower
	 * @param {number} currentPower
	 */

	calculateStrokeArray(maxDots, maxPower, currentPower) {
		// First calculate, what we have
		let dots = Math.round((((currentPower / maxPower) * 100) * maxDots) / 100);
		// Collect all Values
		let strokeDash = '';
		let total = 136;
		let l_amount = dots;
		let l_distance = globalConfig.animation_configuration.distance;
		let l_length = globalConfig.animation_configuration.length;

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
		if (l_amount > 0 && l_length > 0 && l_distance) {
			strokeDash += ' ' + total;
		}

		return strokeDash;
	}


	async buildData() {
		await this.setStateAsync('data', JSON.stringify(outputValues), true);
	}

	async getConfig() {
		// Reset the Arrays/Objects
		globalConfig = {};
		outputValues = {
			values: {},
			unit: {},
			animations: {},
			fillValues: {},
			animationProperties: {}
		};
		rawValues = {
			values: {},
			sourceValues: {}
		};
		sourceObject = {};
		settingsObject = {};
		let clearValue;
		let tmpArray = new Array();
		relativeTimeCheck = {};
		// Put own DP
		tmpArray.push(this.namespace + '.configuration');
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
				this.log.debug('Datasource: ' + JSON.stringify(value));
				if (value.source != '' && value.hasOwnProperty('source')) {
					//addDataSourceRow(_key, key.source, key.alias);
					const stateValue = await this.getForeignStateAsync(globalConfig.datasources[key].source);
					if (stateValue) {
						// Add, to find it better
						sourceObject[globalConfig.datasources[key].source] = {
							id: parseInt(key),
							elmSources: [],
							elmAnimations: [],
							animationProperties: [],
							animationThreshold: [],
							animationType: [],
							animationPower: [],
							animationDots: [],
							animationDuration: []
						};
						rawValues.sourceValues[key] = stateValue.val;
						// Add to SubscribeArray
						tmpArray.push(value.source);
					} else {
						this.log.warn("The adapter could not find the state '" + value.source + "'! Please review your configuration of the adapter!");
					}
				}
			}
		}

		// Collect the Elements, which are using the sources
		if (globalConfig.hasOwnProperty('elements')) {
			for (var key of Object.keys(globalConfig.elements)) {
				const value = globalConfig.elements[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					this.log.debug("Source for Element: " + key + " is: " + value.source + " Plain: " + globalConfig.datasources[value.source].source);
					const stateValue = await this.getForeignStateAsync(globalConfig.datasources[value.source].source);
					if (stateValue) {
						// Insert into initialValues
						if (typeof (stateValue.val) === 'string') {
							clearValue = Number(stateValue.val.replace(/[^\d.-]/g, ''));
						} else {
							clearValue = stateValue.val;
						}

						// Save Settings for the states
						settingsObject[key] = {
							threshold: value.threshold,
							calculate_kw: value.calculate_kw,
							decimal_places: value.decimal_places,
							convert: value.convert,
							type: value.type,
							source_option: value.source_option || -1,
							subtract: value.subtract || [-1]
						};

						// Output Values
						if (value.type == 'text') {
							// Check, if we have source options for text - Date
							if (value.source_option != -1) {
								outputValues.values[key] = this.getDateTime(stateValue.ts, value.source_option);
								outputValues.unit[key] = '';
								rawValues.values[key] = 0;

								// Put into timer object for re-requesting
								if (value.source_option == 'relative') {
									relativeTimeCheck[key] = {
										source: globalConfig.datasources[value.source].source,
										option: value.source_option
									}
								}
							} else {
								outputValues.values[key] = this.valueOutput(key, clearValue);
								outputValues.unit[key] = value.unit;
								rawValues.values[key] = clearValue;
							}
						} else {
							outputValues.fillValues[key] = clearValue;
						}

						// Put Elm into Source
						sourceObject[globalConfig.datasources[value.source].source].elmSources.push(key);
					}
				}
			}
		}

		// Animations
		if (globalConfig.hasOwnProperty('animations')) {
			for (var key of Object.keys(globalConfig.animations)) {
				const value = globalConfig.animations[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					if (value.source.length !== 0) {
						this.log.debug("Animation for Source: " + value.source + " is: " + key);
						// Put Animation into Source
						sourceObject[globalConfig.datasources[value.source].source].elmAnimations.push(key);

						// Put Animation Properties into Source
						sourceObject[globalConfig.datasources[value.source].source].animationProperties.push(value.animation_properties);

						// Put Animation Threshold into Source
						sourceObject[globalConfig.datasources[value.source].source].animationThreshold.push(value.threshold);

						// Put Animation Settings into Source
						if (value.animation_type != -1) {
							sourceObject[globalConfig.datasources[value.source].source].animationType.push(value.animation_type ? value.animation_type : '');
							sourceObject[globalConfig.datasources[value.source].source].animationDuration.push(value.duration ? value.duration : '');
							sourceObject[globalConfig.datasources[value.source].source].animationPower.push(value.power ? value.power : '');
							sourceObject[globalConfig.datasources[value.source].source].animationDots.push(value.dots ? value.dots : '');
						}
					} else {
						this.log.debug("Animation for Source: " + value.source + " not found!");
					}
				}
			}
		}

		this.log.debug('Settings: ' + JSON.stringify(settingsObject));
		this.log.debug("Initial Values: " + JSON.stringify(outputValues.values));
		this.log.debug("Initial Fill-Values: " + JSON.stringify(outputValues.fillValues));
		this.log.debug('Sources: ' + JSON.stringify(sourceObject));
		this.log.debug('RAW-Values: ' + JSON.stringify(rawValues.values));
		this.log.debug('RAW-Source-Values: ' + JSON.stringify(rawValues.sourceValues));
		// Starting Timier
		if (Object.keys(relativeTimeCheck).length > 0) {
			this.log.info('Found relative Date Texts (' + relativeTimeCheck.length + ') to display. Activating timer!');
			this.log.debug('Array for relative texts ' + relativeTimeCheck);
			globalInterval = this.setInterval(() => {
				this.getRelativeTimeObjects(relativeTimeCheck);
			}, 10000);
		}
		this.buildData();

		this.log.info('Configuration loaded!');
		this.log.info("Requesting the following states: " + tmpArray.toString());

		// Renew the subscriptions
		this.subscribeForeignStates(tmpArray);
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