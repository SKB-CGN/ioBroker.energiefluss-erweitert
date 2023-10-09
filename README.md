![Logo](admin/energiefluss-erweitert.png)

# ioBroker.energiefluss-erweitert

[![NPM version](https://img.shields.io/npm/v/iobroker.energiefluss-erweitert?style=flat-square)](https://www.npmjs.com/package/iobroker.energiefluss-erweitert)
[![Downloads](https://img.shields.io/npm/dm/iobroker.energiefluss-erweitert.svg)](https://www.npmjs.com/package/iobroker.energiefluss-erweitert)
![Number of Installations](https://iobroker.live/badges/energiefluss-erweitert-installed.svg)

![GitHub](https://img.shields.io/github/license/SKB-CGN/iobroker.energiefluss-erweitert?style=flat-square)
![GitHub repo size](https://img.shields.io/github/repo-size/SKB-CGN/iobroker.energiefluss-erweitert?logo=github&style=flat-square)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/SKB-CGN/iobroker.energiefluss-erweitert?logo=github&style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/SKB-CGN/iobroker.energiefluss-erweitert?logo=github&style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/SKB-CGN/iobroker.energiefluss-erweitert?logo=github&style=flat-square)

[![NPM](https://nodei.co/npm/iobroker.energiefluss-erweitert.png?downloads=true)](https://nodei.co/npm/iobroker.energiefluss-erweitert/)

![Test and Release](https://github.com/SKB-CGN/ioBroker.energiefluss-erweitert/workflows/Test%20and%20Release/badge.svg)

## energiefluss-erweitert adapter for ioBroker
It provides an animated energyflow for all elements, you add. This could be: photovoltaics, battery, house-consumption, grid-feed-in (grid-consumption), car charge etc.

Documentation:

* [Forum thread](https://forum.iobroker.net/topic/64734/test-adapter-energiefluss-erweitert-v0-0-x-github-latest)
* [???? English description](./docs/en/README.md)
* [???? Deutsche Beschreibung](./docs/de/README.md)

## Documentation

[???? Documentation](./docs/en/README.md)

[???? Dokumentation](./docs/de/README.md)

**Please note, this currently only alpha state**

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
- Added: Using left over space in configbar, to display wider text/number boxes and more text without using more space
- Added: Static navigation in config bar for easier switching between basic and extended settings of the element
- Added: Better handling of boxes in tab menu. Now we use flex views to grow or shrink boxes. Some boxes a re-aligned to use the available space in a more efficient way.
- Added: ACE-Editor with syntax highlighting, autocompletion for properties and error notification while using in CSS tab (more user friendly when applying styles). Style of Log output is also formated with syntax highlighting
- Added: Override function for elements with datasources. Its now possible to add overrides to any element which uses a datasource. With this function, you are able to style the element depending on the value of the datasource
- FIX: Alignment of elements was not working correctly for text append, text prepend and grouped icons
- FIX: When using animation depencies with dots, it could be the case that an icorrect amount of dots was displayed
- FIX: When using subtraction or addition on a datasource the displayed value was not updated if one of the subtraction or addition value changed
- FIX: Some layout fixes

### 0.0.2-alpha.20 (2023-09-22)
- FIX: states in user environment (userdata and javascript) do not need ACK flags anymore
- FIX: Darkmode cleanups and some layout improvements
- FIX: Changed some CSS styles to be consistent
- Added: Version Checker to check the version on Github and inform the user

### 0.0.2-alpha.19 (2023-09-14)
- FIX: Since number animation, it could occur, that decimal places got cut off on initial values
- FIX: Save & Exit was not working correctly, if an high amount of data should be saved
- Added: Made previously count up/down Animation for numbers configurable for each datasource element
- Added: Low power mode for animations (can be enabled generaly or via URL parameter on each device)
- Added: If Element is filled depending on value, it is now possible, to use the basic color as fill for the remaining space or none as transparent

### 0.0.2-alpha.18 (2023-09-11)
- Added: Count up/down Animation for numbers added. Instead of directly changing numbers, they are animated.

### 0.0.2-alpha.17 (2023-09-07)
- FIX: Object browser did not show all states - especially not the ones in Channel or Folders

### 0.0.2-alpha.16 (2023-08-31)
- FIX: Adapter crashed sometimes, due to accessing invalid ids
- Added: Possibility to addition values to other values
- Added: Directly display animations and values after startup instead of waiting till first value changes
- Added: Adapter depencies and stability
- Added: New Translations for new functions

### 0.0.2-alpha.15 (2023-08-10)
- FIX: Under some circumstances symbols, texts and images could run out off workspace
- FIX: consumption calculation produced high CPU load on some systems (#43)
- FIX: Crash-Handler for animations optimized - if animation is present before value is updated, the adapter could crash
- Added: Better duplication of items
- Added: Actions for Datasources and Icons (on, off, toggle) - State can be display in Datasource as well
- Added: Consumption calculation - Added states if battery charge/discharge and public grid-feed/grid-consumption are not the same
- Added: Backup moved from states to ioBroker folder instead (saving Redis power and states loading)
- Added: Loading information for object browser (if not loaded already)
- Added: Darkmode for Layout

### 0.0.2-alpha.14 (2023-08-04)
- Added: Support for SVG elements. SVG will be an area inside the workspace and allows to paste pure SVG data (#31)
- Added: Support for own images. The user is responsible how to upload the image to ioBroker, as the adapter has no upload possibility
- Added: Support to arrange pictures and elements in levels. They can now be moved to fore- or background
- Added: Consumption calculation - Currently, only single-mode (positive and negative) states are supported. Different states for battery charge/discharge and public grid-feed/grid-consumption will be added in next version
- Added: Some error handling improved

### 0.0.2-alpha.13 (2023-07-26)
- FIX: Icon-Proxy was not showing icons under some circumstances
- FIX: Reverse steps for alignment was in the wrong order (#37)
- Added: Build-in Object Browser for faster loading and saving bandwith (get rid of the default one)
- Added: Autocomplete for Datasources Boxes - Datasource will be fetched during typing
- Added: Language for some boxes were missing
- Added: Disable all other Datasources in list while editing to prevent layout mix
- Added: New states for 'battery_remaining_target', which shows the target time in Unixtime and 'battery_remaining_target_DT', which shows the time in human readable format

### 0.0.2-alpha.12 (2023-07-18)
- Added: Improved Icon - Proxy, to serve icons for all symbols (if enabled)
- Added: Language translations for live-view variables

### 0.0.2-alpha.11 (2023-07-17)
- Added: Configuration Bar can be swapped from right to left (better handling, if elements are behind bar)
- Added: Icon-Proxy-Server (if some of your devices inside the network do not have an internet connection, Energiefluss-erweitert will serve those icons and cache them as well)
- Added: Better Help-Center when hitting the question mark icon
- Added: Language translation into: english, german, espanol, french, italian, netherlands, polish language, portuguese, russian, ukrainian, chinese
- Added: Previous outline fill extended for filling reverse

### 0.0.2-alpha.10 (2023-07-10)
- FIX: Basic icon color was not applied correctly
- FIX: Fill placeholders for elements were created in error in some circumstances
- FIX: Subtract was not calculated correctly, if state value is negative
- FIX: Better handling of positioning elements when entering coordinates
- FIX: Icons sometimes got a faulty format if duplicated
- Added: Circles and Rectangles can now have a fill border depending on the value
- Added: Configuration backup for the last 10 versions

### 0.0.2-alpha.9 (2023-07-04)
- FIX: CSS classes were causing color errors while being applied in config mode
- FIX: Do not Load CSS class when adapter is starting - only when values change
- FIX: Threshold was not calculated correctly, if element was substracted by other values
- FIX: ID list in configbar was loosing event for choosing next element in drop-down
- Added: Subtract values from other values
- Added: Start coordinates can be specified in basic settings to better position new elements 
- Added: Threshold for rectangle and circle
- Added: duplication of one or more element(s)
- Added: Fill element according to value can now have different directions (bottom to top, top to bottom, right to left, left to right)

### 0.0.2-alpha.8 (2023-06-26)
- FIX: Remaining Battery Calculation was not working if source has an ID 0 assigned
- FIX: Animation timing improved. Better time-handling (#20)
- FIX: Line could not be clicked/choosen (#19)
- FIX: Threshold was not working correctly
- Added: All elements can have CSS classes for their current state values. Active positive, Active negative, Inactive positive and Inactive negative
- Added: Battery Remaining Time explanation improved
- Added: Animation can run into opposite direction, if value has changed to positive/negative (#15, #18)
- Added: Datasource text elements can now have a text before and after their value

### 0.0.2-alpha.7 (2023-05-25)
- FIX: Some Icons were not moveable
- FIX: Initial configuration was broken
- Added: Existing Line can be modified as well

### 0.0.2-alpha.6 (2023-05-24)
- FIX: Line could not be restored in some circumstances
- FIX: Line was not editable anymore after modifying start and end

### 0.0.2-alpha.5 (2023-05-24)
- Added: Calculation of battery runtime (charge & discharge) can be calculated and implemented via source
- Added: Basic settings extended to colors of elements
- Added: alignment of text is possible (right, middle, left)
- Added: last change timestamp extended to more formats
- Added: Line can be modified (new start and/or end position). Useful, if many settings applied and line needs to be moved

### 0.0.2-alpha.4 (2023-05-17)
- Added: String Datasource can now be displayed

### 0.0.2-alpha.3 (2023-05-17)
- FIX: Animations not running after adding each of them
- Added: Elements can be chosen inside side-panel (useful, if element is not clickable anymore)

### 0.0.2-alpha.2 (2023-05-15)
- FIX: Source missing after saving - fill of element not possible (fix #11)
- FIX: Offset was not working
- Added: admin menu - link recolored
- Added: admin menu - access key table
- Added: question-mark icon for config-wheel
- Added: New animation-depencies added in advanced menu of animation. Choose dots or duration, to display power-amount on the line
- Added: last change timestamp of the datasource can be displayed as option: relative to now, timestamp US or timestamp DE
- Added: all elements can be moved with arrow keys for smoother alignment. Click icon and press arrow-key on keyboard to move it
- Added: noscroll is added to the workspace, while moving elements. This prevents the page being scrolled up or down
- Added: elements can be selected with the "lasso-function" - select more than one element with cursor
- Added: "lasso-catched" elements can be moved with mouse or keyboard (arrow keys)
- Added: Settings-menu has now basic settings for the elements. All values can be set as default values
- Added: displayed values can be reduced by other values (selectable)

### 0.0.2-alpha.1 (2023-04-28)
- FIX: removed local Test file, which does not belong to the project
- Added: Settings Wheel can be disabled in Live-View
- Added: Last selected Datasource can be "cached", for easier treeview (can be enabled/disabled in settings)
- Added: Alignment functions do now have an undo function for all steps
- Added: socket connection is monitored, shows a waiting screen, if instance is not started or restarted

### 0.0.2-alpha.0 (2023-04-28)
* (SKB) initial release

## License
MIT License

Copyright (c) 2023 SKB <info@skb-web.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
