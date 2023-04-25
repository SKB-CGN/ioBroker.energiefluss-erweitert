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
let animationObject = {};
let rawValues = {
	values: {}
}
let outputValues = {
	values: {},
	unit: {},
	animations: {}
};
//let subscribeArray = new Array();

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

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		await this.setObjectNotExistsAsync('configuration', {
			type: 'state',
			common: {
				name: 'Parameters for HTML Output',
				type: 'json',
				role: 'state',
				read: true,
				write: false,
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


		//this.log.info("Requesting the following states complete: " + subscribeArray.toString());

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		//this.subscribeForeignStates(subscribeArray);
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates('*');
		//this.log.info("Adapter started and listening to " + subscribeArray.length + " States");
		//this.log.debug("Initial Values: " + JSON.stringify(valuesObj));
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

				// Loop through each Element, which belongs to that source
				if (sourceObject[id].hasOwnProperty('elmSources')) {
					for (var _key of Object.keys(sourceObject[id].elmSources)) {
						let src = sourceObject[id].elmSources[_key];
						// VALUES
						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Settings for Element " + src + " found! Calculating!")
							// Convertible
							let cValue = settingsObject[src].convert ? this.convertToPositive(clearValue) : clearValue;
							outputValues.values[src] = settingsObject[src].calculate_kw ? this.recalculateValue(cValue, settingsObject[src].decimal_places) : cValue;
							rawValues.values[src] = clearValue;
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
				//Sources: { "sonnen.0.status.production": "0" }
				// Find Elements, which are using the source of the changed ID
				let src;
				/*
				if (sourceObject[id].hasOwnProperty('elmSources')) {
					for (var _key of Object.keys(sourceObject[id].elmSources)) {
						this.log.debug("First Loop!");
						let src = sourceObject[id].elmSources[_key];

						// VALUES
						if (settingsObject.hasOwnProperty(src)) {
							// Convertible
							let cValue = settingsObject[src].convert ? this.convertToPositive(clearValue) : clearValue;
							outputValues.values[src] = settingsObject[src].calculate_kw ? this.recalculateValue(cValue, settingsObject[src].decimal_places) : cValue;
							rawValues.values[src] = clearValue;
							//this.log.info('Calculating Values! Value: ' + outputValues.values[src]);
						} else {
							//this.log.info('Calculatiion not set. Fallback!');
							outputValues.values[src] = clearValue;
							rawValues.values[src] = clearValue;
						}

						// Animation
						if (sourceObject[id].hasOwnProperty('elmAnimations')) {
							for (var anim of Object.keys(sourceObject[id].animationProperties)) {
								this.log.debug("Second Loop");
								let animationValid = true;
								switch (sourceObject[id].animationProperties[anim]) {
									case 'positive':
										if (rawValues.values[sourceObject[src]] > 0 && rawValues.values[sourceObject[src]] > settingsObject[sourceObject[src]].threshold) {
											animationValid = true;
										} else {
											animationValid = false;
										}
										break;
									case 'negative':
										if (rawValues.values[sourceObject[src]] < 0 && rawValues.values[sourceObject[src]] < settingsObject[sourceObject[src]].threshold * -1) {
											animationValid = true;
										} else {
											animationValid = false;
										}
										break;

								}
								//this.log.debug('RAW-Value: ' + rawValues.values[sourceObject[src]] + ' Source: ' + sourceObject[src] + ' Threshold: ' + settingsObject[sourceObject[src]].threshold);
								outputValues.animations[_key] = animationValid;
								this.log.debug("Animations: " + outputValues.animations[_key] + " enabled for Values: " + sourceObject[src].elmSources.toString());
							}
						}
					}
				}
				/*
								if (sourceObject[id].hasOwnProperty('elmAnimations')) {
									for (var _key of Object.keys(sourceObject[id].animationProperties)) {
				
										let src = sourceObject[id].animationProperties[_key];
										this.log.debug("Source: " + src + "Key: " + _key);
										let animationValid = true;
										switch (sourceObject[id].animationProperties[_key]) {
											case 'positive':
												if (rawValues.values[sourceObject[src]] > 0 && rawValues.values[sourceObject[src]] > settingsObject[sourceObject[src]].threshold) {
													animationValid = true;
												} else {
													animationValid = false;
												}
												break;
											case 'negative':
												if (rawValues.values[sourceObject[src]] < 0 && rawValues.values[sourceObject[src]] < settingsObject[sourceObject[src]].threshold * -1) {
													animationValid = true;
												} else {
													animationValid = false;
												}
												break;
				
										}
										this.log.debug('RAW-Value: ' + rawValues.values[sourceObject[src]] + ' Source: ' + sourceObject[src] + ' Threshold: ' + settingsObject[sourceObject[src]].threshold);
										outputValues.animations[_key] = animationValid;
										this.log.debug("Animations: " + outputValues.animations[_key] + " enabled for Values: " + sourceObject[src].elmSources.toString());
									}
								}
				*/
				//outputValues.values[sourceObject[id]] = clearValue;

				/*
								for (var key in tmpAnimArray) {
									// Decide, which to animate
									this.log.debug('RAW-Value: ' + rawValues.values[sourceObject[id]] + ' Source: ' + sourceObject[id] + ' Threshold: ' + settingsObject[sourceObject[id]].threshold);
									let animationValid = true;
									switch (tmpAnimArray[key].properties) {
										case 'positive':
											if (rawValues.values[sourceObject[id]] > 0 && rawValues.values[sourceObject[id]] > settingsObject[sourceObject[id]].threshold) {
												animationValid = true;
											} else {
												animationValid = false;
											}
											break;
										case 'negative':
											if (rawValues.values[sourceObject[id]] < 0 && rawValues.values[sourceObject[id]] < settingsObject[sourceObject[id]].threshold * -1) {
												animationValid = true;
											} else {
												animationValid = false;
											}
											break;
									}
									outputValues.animations[key] = animationValid;
								}
				
								// Check, if we have some animations created
								/*
								if (animationObject.hasOwnProperty(sourceObject[id])) {
									//this.log.info(JSON.stringify(animationObject));
									//this.log.info('Animations exists!');
				
									let tmpArray = animationObject[sourceObject[id]].animations;
									for (let i = 0; i < tmpArray.length; i++) {
										if (clearValue > settingsObject[sourceObject[id]].threshold || 0) {
											// Check, if the destination 
											// Animation true
											outputValues.animations[tmpArray[i]] = true;
										} else {
											// Animation false
											outputValues.animations[tmpArray[i]] = false;
										}
									}
									this.log.info('Animations: ' + JSON.stringify(outputValues.animations));
				
								} else {
									this.log.info('Animations does not exists!');
								}
								*/
				// Collect the animations
				let tmpAnimArray = this.getAnimationPath(sourceObject[id]);
				/*
								for (var key in tmpAnimArray) {
									let animationValid = true;
									// Loop through each Value of the Animation
									for (var _key in globalConfig.animations[tmpAnimArray[key]].sources) {
										let sources = globalConfig.animations[tmpAnimArray[key]].sources[_key];
										this.log.debug('RAW-Value: ' + rawValues.values[sources] + ' Source: ' + sources + ' Threshold: ' + settingsObject[sourceObject[id]].threshold);
										if (rawValues.values[sources] < settingsObject[sourceObject[id]].threshold || rawValues.values[sources] === 0) {
											animationValid = false;
											break;
										}
									}
									outputValues.animations[tmpAnimArray[key]] = animationValid;
									this.log.debug('Animations: ' + JSON.stringify(outputValues.animations));
								}
								*/



				// Add the new value to output
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
	 * @param {number} value
	 */
	recalculateValue(value, decimal_places) {
		return (Math.round((value / 1000) * 100) / 100).toFixed(decimal_places);
	}

	convertToPositive(value) {
		return value < 0 ? (value * -1) : value;
	}

	/**
	 * @param {number} id 
	 */
	/*
	getAnimationPath(id) {
		let tmpArr = new Array;
		this.log.debug('Getting Animation Details');
		for (var key of Object.keys(globalConfig.animations)) {
			for (var _key in globalConfig.animations[key].sources) {
				this.log.debug('Looping in Animation Sources');
				if (globalConfig.animations[key].sources[_key] != null) {
					this.log.debug('Looping in Animation Source is not NULL');
					if (globalConfig.animations[key].sources[_key].toString() === id) {
						tmpArr.push(key);
					}
				}
				if (globalConfig.animations[key].sources[_key] === null) {
					let index = tmpArr.indexOf(key);
					if (index > -1) {
						console.log(key);
						tmpArr.splice(index, 1);
					}
				}
			}
		}
		return tmpArr;
	}
	*/
	getAnimationPath(id) {
		let tmpObj = {};
		for (var key of Object.keys(globalConfig.animations)) {
			if (globalConfig.animations[key].animation == id) {
				tmpObj[key] = { source: id, properties: globalConfig.animations[key].animation_properties }
			}
		}
		return tmpObj;
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
			animations: {}
		};
		rawValues = {
			values: {}
		};
		sourceObject = {};
		settingsObject = {};
		animationObject = {};
		let clearValue;
		let tmpArray = new Array();
		// Put own DP
		tmpArray.push(this.namespace + '.configuration');
		//try {
		// Read configuration DataPoint
		let tmpConfig = await this.getStateAsync('configuration');
		globalConfig = JSON.parse(tmpConfig.val);
		this.log.debug(JSON.stringify(globalConfig));

		// Collect all Datasources
		for (var key of Object.keys(globalConfig.datasources)) {
			const value = globalConfig.datasources[key];
			this.log.debug('Datasource: ' + JSON.stringify(value));
			if (value.source != '' && value.hasOwnProperty('source')) {
				//addDataSourceRow(_key, key.source, key.alias);
				this.log.debug('Reading: Source: ' + value.source + ' ID: ' + key);
				const stateValue = await this.getForeignStateAsync(globalConfig.datasources[key].source);
				if (stateValue) {
					// Add, to find it better
					sourceObject[globalConfig.datasources[key].source] = {
						elmSources: [],
						elmAnimations: [],
						animationProperties: [],
						animationThreshold: []
					};
					// Add to SubscribeArray
					tmpArray.push(value.source);
				} else {
					this.log.warn("The adapter could not find the state '" + value.source + "'! Please review your configuration of the adapter!");
				}
			}
		}

		// Collect the Elements, which are using the sources
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

					// Output Values
					let cValue = value.convert ? this.convertToPositive(clearValue) : clearValue;
					outputValues.values[key] = value.calculate_kw ? this.recalculateValue(cValue, value.decimal_places) : cValue;
					outputValues.unit[key] = value.unit;
					rawValues.values[key] = clearValue;

					// Save Settings for the states
					settingsObject[key] = {
						threshold: value.threshold,
						calculate_kw: value.calculate_kw,
						decimal_places: value.decimal_places,
						convert: value.convert
					};
					// Put Elm into Source
					sourceObject[globalConfig.datasources[value.source].source].elmSources.push(key);
				}
			}
		}

		// Animations
		for (var key of Object.keys(globalConfig.animations)) {
			const value = globalConfig.animations[key];
			if (value.animation != -1 && value.hasOwnProperty('animation')) {
				if (value.animation.length !== 0) {
					this.log.debug("Animation for Source: " + value.animation + " is: " + key);
					// Put Animation into Source
					sourceObject[globalConfig.datasources[value.animation].source].elmAnimations.push(key);

					// Put Animation Properties into Source
					sourceObject[globalConfig.datasources[value.animation].source].animationProperties.push(value.animation_properties);

					// Put Animation Threshold into Source
					sourceObject[globalConfig.datasources[value.animation].source].animationThreshold.push(value.threshold);
				} else {
					this.log.debug("Animation for Source: " + value.animation + " not found!");
				}
			}
		}

		// Now, sort each source into 
		/*
				for (var key of Object.keys(globalConfig.elements)) {
					const value = globalConfig.elements[key];
					if (value.source != -1) {
						this.log.debug('Reading: ' + JSON.stringify(globalConfig.datasources[value.source]) + 'For: ' + value.source + 'ID: ' + key);
						const stateValue = await this.getForeignStateAsync(globalConfig.datasources[value.source].source);
						if (stateValue) {
							tmpArray.push(value.source);
							// Add, to find it better
							sourceObject[globalConfig.datasources[value.source].source] = key;
		
							// Insert into initialValues
							if (typeof (stateValue.val) === 'string') {
								clearValue = Number(stateValue.val.replace(/[^\d.-]/g, ''));
							} else {
								clearValue = stateValue.val;
							}
		
							// Output Values
							let cValue = value.convert ? this.convertToPositive(clearValue) : clearValue;
							outputValues.values[key] = value.calculate_kw ? this.recalculateValue(cValue, value.decimal_places) : cValue;
							outputValues.unit[key] = value.unit;
							rawValues.values[key] = clearValue;
		
							// Save Settings for the sates
							settingsObject[key] = {
								threshold: value.threshold,
								calculate_kw: value.calculate_kw,
								decimal_places: value.decimal_places,
								convert: value.convert
							};
						} else {
							this.log.warn("The adapter could not find the state '" + value.source + "'! Please review your configuration of the adapter!");
						}
					}
					// Animations
					/*
					if (value.animation && value.animation != 'undefined' && value.animation != '') {
						this.log.info("Animations func for ID: " + value.animation);
						// Find the correct Animation for this
						Object.entries(globalConfig.animations).forEach(entry => {
							//this.log.info("in the loop");
							const [key, uvalue] = entry;
							let tmpID;
							// Get each ID and check
							tmpID = uvalue.id.split("_");
							//this.log.info("ID: " + tmpID[2]);
							//this.log.info('Animation: ' + value.animation);
							if (tmpID[2] == value.id) {
								animArray.push(uvalue.id);
								outputValues.animations[uvalue.id] = false;
							}
						});
						animationObject[value.animation] = { animations: animArray };
					}
					*/

		//}
		this.log.debug('Settings: ' + JSON.stringify(settingsObject));
		this.log.debug("Initial Values: " + JSON.stringify(outputValues.values));
		this.log.debug('Sources: ' + JSON.stringify(sourceObject));
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