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
* [English description](https://github.com/SKB-CGN/ioBroker.energiefluss-erweitert/blob/main/docs/en/energiefluss-erweitert.md)
* [Deutsche Beschreibung](https://github.com/SKB-CGN/ioBroker.energiefluss-erweitert/blob/main/docs/de/energiefluss-erweitert.md)

**Please note, this currently only alpha state**

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
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
