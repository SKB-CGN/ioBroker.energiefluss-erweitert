// Socket.IO - connection parameters
// find out, which instance we are using
const urlParams = new URLSearchParams(window.location.search);
const instance = urlParams.get('instance') ? urlParams.get('instance') : 0;

// Start connections to ioBroker Service
let adapterNameNamespace = 'energiefluss-erweitert.' + instance;
console.log('Using Instance: ' + adapterNameNamespace);
let objID = [adapterNameNamespace + '.configuration', adapterNameNamespace + '.data'];

// Basic config for workspace
let configuration_default = {
    line: {
        stroke_width: 8,
        stroke: '#000000'
    },
    basic: {
        enable_grid: true,
        enable_animation: false,
        enable_area_catch: true,
        height: 600,
        width: 800,
        styles: ''
    },
    animation: {
        stroke: "#ffce4a",
        stroke_dasharray: "4 12 4 12 4 100",
        stroke_width: 6,
        animation_duration: 2000,
        stroke_linecap: "round",
        animation_timing_function: "linear"
    },
    animation_configuration: {
        dots: 4,
        distance: 12,
        length: 6
    },
    animations: {},
    lines: {}
}, configuration = configuration_default;

// Check, if we are displaying or configuring something
let displayMode = false;
let localMode = false;
let globalConfigChanged = false;

// Find some URL params
var url = window.location.pathname;
let port = window.location.port;

if (port == '') {
    localMode = true;
    console.log("Local Mode activated!");
}

var filename = url.substring(url.lastIndexOf('/') + 1);
if (filename.includes('index') || filename == '') {
    // We are in display-mode
    displayMode = true;
} else {
    // Colors
    jscolor.presets.default = {
        format: 'rgba',
        borderColor: '#538EA3',
        borderRadius: 10,
        controlBorderColor: '#538EA3',
        previewSize: 28,
        previewPosition: 'right',
        required: false,
        palette: ['#00b5dd', '#61687a', '#ffce4a', '#a1d343', '#c5902e', '#f20e40']
    };
}

/* ID Selector */
let selectId;
let iobObjects;

var iobPath = location.pathname;
var iobParts = iobPath.split('/');
iobParts.splice(-3);

if (location.pathname.match(/^\/admin\//)) {
    iobParts = [];
}

if (!localMode) {
    var socket = io.connect('/', {
        path: iobParts.join('/') + '/socket.io',
        reconnectionDelay: 500,
        reconnectionAttempts: Infinity
    });

    // First load the objects

    socket.emit('getObjects', function (err, objs) {
        iobObjects = objs;
    });
}

function initSelectId(callback) {
    if (selectId) {
        return callback(selectId);
    }
    selectId = $('#dialog-select-member').selectId('init', {
        noMultiselect: true,
        objects: iobObjects,
        imgPath: '../../lib/css/fancytree/',
        filter: {
            type: 'state'
        },
        name: 'scenes-select-state',
        texts: {
            select: _('Select'),
            cancel: _('Cancel'),
            all: _('All'),
            id: _('ID'),
            name: _('Name'),
            role: _('Role'),
            room: _('Room'),
            value: _('Value'),
            selectid: _('Select ID'),
            from: _('From'),
            lc: _('Last changed'),
            ts: _('Time stamp'),
            wait: _('Processing...'),
            ack: _('Acknowledged'),
            selectAll: _('Select all'),
            unselectAll: _('Deselect all'),
            invertSelection: _('Invert selection')
        },
        columns: ['image', 'name', 'role', 'room']
    });
    callback(selectId);
}

/* END ID Selector */

// Max ID for config element
let max_elm_id = 0;

// Restore Object
let restore = {};

function displayLoading(text) {
    $('#loading_text').text(text);
    $('#loading, .loading-spinner, #loading_text').show();
}

function displayListener() {
    if (!localMode) {
        // Receive state changings
        socket.emit('subscribe', objID);
        console.log('[Socket] subscribed to: ' + objID.toString());

        // Event Listener
        socket.on('connect', function () {
            console.log('[Socket] connected!');
        });

        socket.on('reconnect', function () {
            console.log('[Socket] reconnected');
            $('#loading').fadeOut('fast');
        });

        socket.on('disconnect', function () {
            console.log('[Socket] disconnected');
            displayLoading('Reconnecting to your Energiefluss - erweitert');
        });

        socket.on('objectChange', function (objectId, obj) {
            //console.debug('[Socket] Object Change: ' + objectId);
        });

        socket.on('stateChange', function (stateId, state) {
            setTimeout(function () {
                if (stateId == objID[0]) {
                    try {
                        displayLoading('Applying new configuration to your Energiefluss - erweitert');
                        configuration = JSON.parse(state.val);
                        setLoadedConfig();

                    } catch (error) {
                        console.log('Error while parsing Config in JSON-Object!');
                    }
                }
                if (stateId == objID[1]) {
                    try {
                        refreshData(JSON.parse(state.val));
                    } catch (error) {
                        console.log('Error while parsing Values in JSON-Object!');
                    }
                }
                //console.log('[Socket] State Change: ' + stateId);
            }, 0);
        });

        socket.on('reauthenticate', function () {
            console.log('[Socket] reauthenticate');
        });
        socket.on('error', function (e) {
            console.error('[Socket] error: ' + e);
        });
        socket.on('connect_error', function (e) {
            console.error('[Socket] connect error: ' + e);
        });
        socket.on('permissionError', function (e) {
            console.error('[Socket] permission error: ' + e);
        });
    }
}

function refreshData(obj) {
    // Values
    Object.entries(obj.values).forEach(entry => {
        const [key, value] = entry;
        // Update corresponding ID
        $('#' + key).html(value + ' ' + obj.unit[key]);
    });

    // Animations
    Object.entries(obj.animations).forEach(entry => {
        const [key, value] = entry;
        // Update corresponding ID - Only in DisplayMode
        if (displayMode) {
            $('#' + key).css('display', value ? 'inline' : 'none');
        }
    });
}

function loadConfig() {
    console.log('Loading config for instance: ' + instance);
    // Load the configuration from ioBroker
    if (!localMode) {
        socket.emit('getStates', objID, function (err, _states) {
            if (err) {
                console.log(err);
                failedMessage('An error occured, while receiving data!');
            } else {
                // Retrieve States
                if (_states) {
                    // Check, if Namespace exists
                    if (_states[objID[0]] != null) {
                        try {
                            configuration = JSON.parse(_states[objID[0]].val);
                            setLoadedConfig();
                        }
                        catch (e) {
                            failedMessage('The configuration is invalid! Could not load the config!');
                            console.log(e);
                        }
                    } else {
                        failedMessage('The Instance <b>' + instance + '</b>, you are trying to access does not exist!');
                    }
                    if (_states[objID[1]] != null) {
                        try {
                            console.log('Loading initial Data.');
                            refreshData(JSON.parse(_states[objID[1]].val));
                        }
                        catch (e) {
                            console.log(e);
                        }
                    }
                } else {
                    failedMessage('Could not receive any values! Something is wrong!');
                }
            }
        });
    } else {
        configuration = localTest;
        console.log("Loading Local Config!");
        setLoadedConfig();
    }
}

function getDataSources(select, selected) {
    // Add Chooser to the beginning
    $('#' + select).empty().append(new Option('Please choose ...', '-1'));
    let o;
    $(".data-table tbody tr").each(function () {
        console.log("Data: " + $(this).data('id'));
        if ($(this).data('id') == -1) {
            console.log("Inside!");
            o = new Option('There are currently no sources added!', '-1');
            o.disabled = true;
            o.title = 'Go to the tab Datasources and add some';
            //return false;
        } else {
            o = new Option($('td:eq(0)', this).text() + ' (' + $('td:eq(1)', this).text() + ')', $(this).data('id'));
            o.selected = $(this).data('id') == selected ? true : false;
        }
        $('#' + select).append(o);
    });
}

function setLoadedConfig() {
    // Grid
    $('#svg_width_slider').val(configuration.basic.width);
    $('#svg_height_slider').val(configuration.basic.height);

    $('#svg_width_value').val(configuration.basic.width).change();
    $('#svg_height_value').val(configuration.basic.height).change();

    // Checkboxes
    $('#enable_animation').prop('checked', configuration.basic.enable_animation).change();
    $('#enable_grid').prop('checked', configuration.basic.enable_grid).change();
    $('#enable_area_catch').prop('checked', configuration.basic.enable_area_catch).change();
    // Init
    $('#line_size').val(configuration.line.stroke_width);
    // Animation
    $('#animation_width').val(configuration.animation.stroke_width);
    $('#animation_duration').val(configuration.animation.animation_duration);
    $('#animation_type').val(configuration.animation.animation_timing_function);
    $('#animation_linecap').val(configuration.animation.stroke_linecap);
    // Animation-Config
    $('#animation_dots').val(configuration.animation_configuration.dots);
    $('#animation_distance').val(configuration.animation_configuration.distance);
    $('#animation_length').val(configuration.animation_configuration.length);


    // Update things
    updateLineAnimation();

    // Add own CSS
    $('#style_user').empty().append(configuration.basic.styles);
    if ($('#own_css').length > 0) {
        // ConfigMode - Apply to textarea
        $('#own_css').val(configuration.basic.styles);
    }

    // Check, if we are loading User-Config
    if (configuration.hasOwnProperty('elements')) {
        // Delete all Elements
        $('.placeholders').empty();
        console.log("Loading User Config ...");
        // Elements
        Object.entries(configuration.elements).forEach(entry => {
            const [key, value] = entry;
            addElement({
                format: value.type,
                subType: value.subType,
                id: value.id,
                radius: value.radius,
                width: value.width,
                height: value.height,
                rx: value.rx,
                stroke: value.stroke,
                pos_x: value.pos_x,
                pos_y: value.pos_y,
                color: value.color,
                fill: value.fill,
                icon: value.icon,
                connPoint1: value.startSlot,
                connPoint2: value.endSlot,
                text: value.text,
                font_size: value.font_size,
                font_family: value.font_family,
                unit: value.unit,
                source: value.source || -1,
                degree: value.degree,
                shadow: value.shadow,
                threshold: value.threshold || 0,
                convert: value.convert || false,
                calculate_kw: value.calculate_kw || false,
                decimal_places: value.decimal_places || 0,
                url: value.url || '',
                frame: value.frame || '_overlay'
            });
        });
        // Defs
        Object.entries(configuration.defs).forEach(entry => {
            const [key, value] = entry;
            addElement({
                format: value.type,
                id: value.id,
                connPoint1: value.startSlot,
                connPoint2: value.endSlot,
                d: value.d
            });
        });
        // Lines
        Object.entries(configuration.lines).forEach(entry => {
            const [key, value] = entry;
            addElement({
                format: value.type,
                id: value.id,
                href: value.href,
                color: value.color
            });
        });
        // Animation
        Object.entries(configuration.animations).forEach(entry => {
            const [key, value] = entry;
            addElement({
                format: value.type,
                id: value.id,
                href: value.href,
                color: value.color,
                animation: value.animation,
                animation_properties: value.animation_properties || 'positive',
                threshold: value.threshold || 0
            });
        });
        if (configuration.hasOwnProperty('datasources')) {
            // DataSources
            for (var key of Object.keys(configuration.datasources)) {
                const value = configuration.datasources[key];
                if (value) {
                    addDataSourceRow(key, value.source, value.alias);
                }
            }
        }
        // Display-Mode active
        if (displayMode) {
            // Adjust SVG
            $('#svg_display').attr({
                'viewBox': '0 0 ' + configuration.basic.width + ' ' + configuration.basic.height
            });
            // Remove Editable classes
            $('.all_elements').removeClass('draggable draggable-group anim_element no_animation');
            // Add normal Animation Class
            $('.type_animation').addClass('animation');
            // Add Link for configuration
            $('#config_link > a').attr('href', 'configuration.html?instance=' + instance);
            // Remove all Text and Title from Datasources
            $('.type_datasource').html('').attr('title', '');
            // Overlay Frame Listener
            $("#overlay_frame").on("load", function () {
                if ($(this).attr('src') != "") {
                    $(".loading-spinner, #loading_text").fadeOut('fast');
                    $("#display_container").fadeIn('middle').css('display', 'block');
                }
            });
            // Check for each connector Element, if we have an URL
            $('.connector').each(function () {
                if ($(this).data('url')) {
                    $(this).css({
                        'pointer-events': 'all',
                        'cursor': 'pointer'
                    });
                    $(this).click(function () {
                        // Which Frame?
                        switch ($(this).data('frame')) {
                            case '_blank':
                            case '_self':
                                var win = window.open($(this).data('url'), $(this).data('frame'));
                                if (win) {
                                    //Browser has allowed it to be opened
                                    win.focus();
                                } else {
                                    //Browser has blocked it
                                    failedMessage('You need to allow opening URL\'s for this Website!')
                                }
                                break;
                            case '_overlay':
                                displayLoading('Loading site for element');
                                $('#overlay_frame').attr('src', $(this).data('url'));
                                break;
                        }
                        console.log('URL found! ' + $(this).data('url') + 'Frame: ' + $(this).data('frame'));
                    });
                }
            });
            // Start the Listener for Display-Mode
            displayListener();
        }
        successMessage('Layout configuration was loaded successfully!');
        $("#loading").fadeOut("fast");
        // Remove noscroll after loading the page
        //$('body').removeClass('noscroll');
    } else {
        successMessage('Basic configuration was loaded successfully!');
        $("#loading").fadeOut("fast");
    }
}

function updateLineAnimation() {
    $('#style_animation').empty()
        //Line     
        .append('.line {stroke-width:' + configuration.line.stroke_width + 'px; stroke:' + configuration.line.stroke + ';}')
        // Animation
        .append('.animation {stroke:' + configuration.animation.stroke + '; stroke-dasharray:' + configuration.animation.stroke_dasharray + ';')
        .append('stroke-width:' + configuration.animation.stroke_width + 'px; animation-duration:' + configuration.animation.animation_duration + 'ms;')
        .append('stroke-linecap:' + configuration.animation.stroke_linecap + '; animation-timing-function:' + configuration.animation.animation_timing_function + ';}');
    if (displayMode) {
        // Disable Animation while in Display-Mode
        $('#style_animation').append('.type_animation {display: none;}');
    }
}

function linePreview(id) {
    // Collect all Values
    let strokeDash = '';
    let total = 136;
    let l_width = $('#animation_width').val();
    let l_amount = $('#animation_dots').val();
    let l_distance = $('#animation_distance').val();
    let l_length = $('#animation_length').val();
    let l_thickness = $('#line_size').val();
    let l_duration = $('#animation_duration').val();
    let l_linecap = $('#animation_linecap').val();
    let l_animation = $('#animation_type').val();


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
    // Reset the Value, if we run into negativ
    if (total < 0) {
        $('#' + id).val($('#' + id).val() - 1);
    }

    configuration.animation.stroke_dasharray = strokeDash;
    configuration.animation.stroke_width = l_width;
    configuration.animation.animation_duration = l_duration;
    configuration.animation.stroke_linecap = l_linecap;
    configuration.animation.animation_timing_function = l_animation;

    configuration.line.stroke_width = l_thickness;

    configuration.animation_configuration.dots = l_amount;
    configuration.animation_configuration.distance = l_distance;
    configuration.animation_configuration.length = l_length;
    updateLineAnimation();
}

function successMessage(text) {
    $('#message_success').html(text);
    $('#message_success').fadeIn('middle').delay(2000).fadeOut('middle');
}

function failedMessage(text) {
    $('#message_failed').html(text);
    $('#message_failed').fadeIn('middle').delay(2000).fadeOut('middle');
}

function getRotationDegrees(obj) {

    var matrix = obj.css("-webkit-transform") ||
        obj.css("-moz-transform") ||
        obj.css("-ms-transform") ||
        obj.css("-o-transform") ||
        obj.css("transform");
    if (matrix !== 'none') {
        var values = matrix.split('(')[1].split(')')[0].split(',');
        var a = values[0];
        var b = values[1];
        var angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
    } else { var angle = 0; }
    return angle;
}

function resizeSVG() {
    $('#svg_config').attr({
        'width': $('#svg_width_value').val(),
        'height': $('#svg_height_value').val(),
        'viewBox': '0 0 ' + $('#svg_width_value').val() + ' ' + $('#svg_height_value').val()
    });
}
/*
function drawLine(id) {
    // Line
    let l = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    l.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + id);
    l.setAttribute('class', 'line type_line all_elements');
    l.setAttribute('id', 'line_' + id);
    l.setAttribute('style', 'stroke: ' + configuration.line.stroke + ';');
    $(l).appendTo('#placeholder_lines');
}
*/

function getCoords(elm) {
    elm = "#" + elm;
    let x, y, r, width, height, stroke, slot, cx, cy;
    r = $(elm).attr("r") != null ? parseInt($(elm).attr("r")) : 0;
    x = $(elm).attr("x") != null ? parseInt($(elm).attr("x")) : parseInt($(elm).attr("cx")) - r;
    y = $(elm).attr("y") != null ? parseInt($(elm).attr("y")) : parseInt($(elm).attr("cy")) - r;
    cx = $(elm).attr("cx") != null ? parseInt($(elm).attr("cx")) : 0;
    cy = $(elm).attr("cy") != null ? parseInt($(elm).attr("cy")) : 0;
    width = $(elm).attr("width") != null ? parseInt($(elm).attr("width")) : 2 * r;
    height = $(elm).attr("height") != null ? parseInt($(elm).attr("height")) : 2 * r;
    stroke = parseInt($(elm).css("stroke-width"));

    // Check, if Text maybe in use
    if ($(elm).prop('tagName') === 'text') {
        //let tmpSize = document.getElementById(elm.replace('#', '')).getBoundingClientRect();
        //console.log(tmpSize.width);
        width = Math.round(document.getElementById(elm.replace('#', '')).getComputedTextLength());
        //width = tmpSize.width;
        height = parseInt($(elm).css("font-size"));
        x = Math.round(x - Math.floor(width / 2));
        y = Math.round(y - Math.floor(height / 2));
    }

    return { x: x, y: y, cx: cx, cy: cy, width: width, height: height, r: r, stroke: stroke, slot: slot };
}

function showConnectionPoints(display = true) {
    if (display) {
        $('#connection_points').empty();
        $(".connector").each(function () {
            let index = $(this).attr('id');
            let points = {};
            points[index] = {};

            // First, detect, which Element Type do we have
            let type = $(this).prop('tagName');
            let height, width, x, y, r, cx, cy, pos;
            switch (type) {
                case 'circle':
                    height = parseInt($(this).attr('r') * 2);
                    width = parseInt($(this).attr('r') * 2);
                    x = parseInt($(this).attr('cx') - (width / 2));
                    y = parseInt($(this).attr('cy') - (height / 2));
                    r = parseInt($(this).attr('r'));
                    cx = parseInt($(this).attr('cx'));
                    cy = parseInt($(this).attr('cy'));

                    points[index]['top_left'] = { x: cx + (r * Math.cos(connectorAngle(340))), y: cy + (r * Math.sin(connectorAngle(340))) };
                    points[index]['top_right'] = { x: cx + (r * Math.cos(connectorAngle(20))), y: cy + (r * Math.sin(connectorAngle(20))) };
                    points[index]['right_top'] = { x: cx + (r * Math.cos(connectorAngle(70))), y: cy + (r * Math.sin(connectorAngle(70))) };
                    points[index]['right_bottom'] = { x: cx + (r * Math.cos(connectorAngle(110))), y: cy + (r * Math.sin(connectorAngle(110))) };
                    points[index]['bottom_left'] = { x: cx + (r * Math.cos(connectorAngle(200))), y: cy + (r * Math.sin(connectorAngle(200))) };
                    points[index]['bottom_right'] = { x: cx + (r * Math.cos(connectorAngle(160))), y: cy + (r * Math.sin(connectorAngle(160))) };
                    points[index]['left_bottom'] = { x: cx + (r * Math.cos(connectorAngle(250))), y: cy + (r * Math.sin(connectorAngle(250))) };
                    points[index]['left_top'] = { x: cx + (r * Math.cos(connectorAngle(290))), y: cy + (r * Math.sin(connectorAngle(290))) };

                    break;
                case 'rect':
                    height = parseInt($(this).attr('height'));
                    width = parseInt($(this).attr('width'));
                    x = parseInt($(this).attr('x'));
                    y = parseInt($(this).attr('y'));
                    points[index]['top_left'] = { x: (x + (width / 2) - 20), y: y };
                    points[index]['top_right'] = { x: (x + (width / 2) + 20), y: y };
                    points[index]['left_top'] = { x: x, y: (y + (height / 2) - 20) };
                    points[index]['left_bottom'] = { x: x, y: (y + (height / 2) + 20) };
                    points[index]['right_top'] = { x: x + width, y: (y + (height / 2) - 20) };
                    points[index]['right_bottom'] = { x: x + width, y: (y + (height / 2) + 20) };
                    points[index]['bottom_left'] = { x: (x + (width / 2) - 20), y: y + height };
                    points[index]['bottom_right'] = { x: (x + (width / 2) + 20), y: y + height };
                    break;
            }

            // Valid for both elements
            points[index]['top'] = { x: x + (width / 2), y: y };
            points[index]['left'] = { x: x, y: y + (height / 2) };
            points[index]['right'] = { x: x + width, y: y + (height / 2) };
            points[index]['bottom'] = { x: x + (width / 2), y: y + height };

            Object.entries(points).forEach(entry => {
                const [key, value] = entry;
                Object.entries(value).forEach(entry => {
                    const [key, value] = entry;
                    let c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    c.setAttribute('class', 'tmp_conn_points');
                    c.setAttribute('cx', value.x);
                    c.setAttribute('cy', value.y);
                    c.setAttribute('r', 5);
                    c.setAttribute('class', 'connPoints clickable');
                    c.setAttribute('data-slot', key);
                    c.setAttribute('data-element', index);
                    $(c).appendTo("#connection_points");
                });
            });
        });
    } else {
        $('#connection_points').empty();
    }
}

function addAnimation(id) {
    // Check, if Animation exists
    if ($('#anim_' + id).length === 0) {
        $('#anim_' + id).remove();
        // Animation
        let a = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        let classes = 'type_animation all_elements anim_element';
        if ($('#enable_animation').is(':checked')) {
            classes += " animation";
        } else {
            classes += " no_animation";
        }
        a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + id);
        a.setAttribute('class', classes);
        a.setAttribute('id', 'anim_' + id);
        a.setAttribute('data-animation', '-1');
        a.setAttribute('data-animation_properties', 'positive');
        a.setAttribute('data-threshold', '0');
        a.setAttribute('style', 'stroke: ' + configuration.animation.stroke + ';');
        $(a).appendTo('#placeholder_animations');
        $('.anim_element').off().click(function (event) {
            showConfigBar(event.target.id, event.target.tagName.toLowerCase());
        });
    }
}

function getSlots(elm) {
    //elm = "#" + elm;
    // Get the possible Slots for the Element
    let top = {}, right = {}, bottom = {}, left = {};

    // Top
    top.x = elm.x + Math.floor(elm.width / 2);
    top.y = elm.y - Math.floor(elm.stroke / 2);
    top.direction = 'vertical';

    // Right
    right.x = elm.x + elm.width + Math.floor(elm.stroke / 2);
    right.y = elm.y + Math.floor(elm.height / 2);
    right.direction = 'horizontal';

    // Bottom
    bottom.x = elm.x + (elm.width / 2);
    bottom.y = elm.y + elm.height + Math.floor(elm.stroke / 2);
    bottom.direction = 'vertical';

    // Left
    left.x = elm.x - Math.floor(elm.stroke / 2);
    left.y = elm.y + Math.floor(elm.height / 2);
    left.direction = 'horizontal';

    return { top: top, right: right, bottom: bottom, left: left }
}

function connectorAngle(angleInDegrees) {
    return (angleInDegrees - 90) * Math.PI / 180.0;
}

function getSpecialSlots(elm, slot) {
    let specialSlots = [];
    // Valid for both elements
    specialSlots['top'] = { x: elm.x + (elm.width / 2), y: elm.y - elm.stroke / 2, direction: 'vertical' };
    specialSlots['left'] = { x: elm.x - elm.stroke / 2, y: elm.y + (elm.height / 2), direction: 'horizontal' };
    specialSlots['right'] = { x: elm.x + elm.width + elm.stroke / 2, y: elm.y + (elm.height / 2), direction: 'horizontal' };
    specialSlots['bottom'] = { x: elm.x + (elm.width / 2), y: elm.y + elm.height + elm.stroke / 2, direction: 'vertical' };
    if (elm.r > 0) {
        specialSlots['top_left'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(340))), y: elm.cy + (elm.r * Math.sin(connectorAngle(340))) - elm.stroke / 2, direction: 'vertical' };
        specialSlots['top_right'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(20))), y: elm.cy + (elm.r * Math.sin(connectorAngle(20))) - elm.stroke / 2, direction: 'vertical' };

        specialSlots['right_top'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(70))) + elm.stroke / 2, y: elm.cy + (elm.r * Math.sin(connectorAngle(70))), direction: 'horizontal' };
        specialSlots['right_bottom'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(110))) + elm.stroke / 2, y: elm.cy + (elm.r * Math.sin(connectorAngle(110))), direction: 'horizontal' };

        specialSlots['bottom_left'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(200))), y: elm.cy + (elm.r * Math.sin(connectorAngle(200))) + elm.stroke / 2, direction: 'vertical' };
        specialSlots['bottom_right'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(160))), y: elm.cy + (elm.r * Math.sin(connectorAngle(160))) + elm.stroke / 2, direction: 'vertical' };

        specialSlots['left_bottom'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(250))) - elm.stroke / 2, y: elm.cy + (elm.r * Math.sin(connectorAngle(250))), direction: 'horizontal' };
        specialSlots['left_top'] = { x: elm.cx + (elm.r * Math.cos(connectorAngle(290))) - elm.stroke / 2, y: elm.cy + (elm.r * Math.sin(connectorAngle(290))), direction: 'horizontal' };
    } else {
        specialSlots['top_left'] = { x: (elm.x + (elm.width / 2) - 20), y: elm.y - elm.stroke / 2, direction: 'vertical' };
        specialSlots['top_right'] = { x: (elm.x + (elm.width / 2) + 20), y: elm.y - elm.stroke / 2, direction: 'vertical' };

        specialSlots['right_top'] = { x: elm.x + elm.width + elm.stroke / 2, y: (elm.y + (elm.height / 2) - 20), direction: 'horizontal' };
        specialSlots['right_bottom'] = { x: elm.x + elm.width + elm.stroke / 2, y: (elm.y + (elm.height / 2) + 20), direction: 'horizontal' };

        specialSlots['bottom_left'] = { x: (elm.x + (elm.width / 2) - 20), y: elm.y + elm.height + elm.stroke / 2, direction: 'vertical' };
        specialSlots['bottom_right'] = { x: (elm.x + (elm.width / 2) + 20), y: elm.y + elm.height + elm.stroke / 2, direction: 'vertical' };

        specialSlots['left_top'] = { x: elm.x - elm.stroke / 2, y: (elm.y + (elm.height / 2) - 20), direction: 'horizontal' };
        specialSlots['left_bottom'] = { x: elm.x - elm.stroke / 2, y: (elm.y + (elm.height / 2) + 20), direction: 'horizontal' };
    }
    return { 'spec': specialSlots[slot] };
}

function getDistance(point1, point2) {
    let xs = 0;
    let ys = 0;

    xs = point2.x > point1.x ? point2.x - point1.x : point1.x - point2.x;
    xs = xs * xs;

    ys = point2.y > point1.y ? point2.y - point1.y : point1.y - point2.y;
    ys = ys * ys;

    return Math.sqrt(xs + ys);
}

function connectElements(path, startElem, endElem) {
    // get (top, left) coordinates for the two elements
    let startCoord = getCoords(startElem);
    let endCoord = getCoords(endElem);

    // Get Path specific start and end points
    let startSlot, endSlot, startSlots, endSlots;
    startSlot = $('#' + path).data('start-slot');
    endSlot = $('#' + path).data('end-slot');

    let dist = [];
    let startPosX = [], endPosX = [];
    let startPosY = [], endPosY = [];
    let startDir = [], endDir = [];

    startSlots = startSlot !== 'undefined' ? getSpecialSlots(startCoord, startSlot) : getSlots(startCoord);
    endSlots = endSlot !== 'undefined' ? getSpecialSlots(endCoord, endSlot) : getSlots(endCoord);

    for (var key of Object.keys(startSlots)) {
        let tmpKey = startSlots[key];
        for (var key of Object.keys(endSlots)) {
            let curKey = endSlots[key];
            // Distance
            dist.push(getDistance(tmpKey, curKey));
            startPosX.push(tmpKey.x);
            startPosY.push(tmpKey.y);
            startDir.push(tmpKey.direction);

            endPosX.push(curKey.x);
            endPosY.push(curKey.y);
            endDir.push(curKey.direction);
        }
    }

    // Now find the smallest distance
    let test = dist[0];
    let index = 0;

    for (var i = 1; i < dist.length; i++) {
        if (dist[i] < test) {
            test = dist[i];
            index = i;
        }
    }

    //console.log("Index: " + index + " StartX: " + startPosX[index] + " Start-Y :" + startPosY[index] + " End-X: " + endPosX[index] + " End-Y: " + endPosY[index] + " Start-Direction: " + startDir[index] + " End-Direction: " + endDir[index]);

    // calculate path's start (x,y)  coords
    let startX = startPosX[index];
    let startY = startPosY[index];

    // calculate path's end (x,y) coords
    let endX = endPosX[index];
    let endY = endPosY[index];

    drawPath(path, startX, startY, endX, endY, startDir[index], endDir[index]);
}

/* After her new function */
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(x, y, radius, startAngle, endAngle, forward) {

    var start = polarToCartesian(x, y, radius, endAngle);
    var end = polarToCartesian(x, y, radius, startAngle);

    var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    var d = [
        //"M", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, forward, start.x, start.y
    ];

    return d;
}

function drawPath(path, fromX, fromY, toX, toY, startDir, endDir, radius = 15) {
    // First check the directions
    // Asume, we always go from left to right and from top to bottom
    let curr_pos = { x: 0, y: 0 };

    // The line consists of a maximum of 5 elements
    let lineParts = [];

    // First check the distance
    let distanceX = fromX > toX ? fromX - toX : toX - fromX;
    let distanceY = fromY > toY ? fromY - toY : toY - fromY;

    if (distanceX < radius * 2) {
        radius = Math.floor(distanceX / 2);
    }

    if (distanceY < radius * 2) {
        radius = Math.floor(distanceY / 2);
    }

    let line_cmpl_x = toX > fromX ? parseInt(toX - fromX) : parseInt(fromX - toX);

    let line_cmpl_y = toY > fromY ? parseInt(toY - fromY) : parseInt(toY - fromY);

    let percBreak = 0.2;

    /* 0. Part */
    lineParts[0] = "M" + fromX + " " + fromY;
    curr_pos = { x: fromX, y: fromY };
    let arc;

    /* 1. Part */

    if (toX > fromX) {
        // Go right
        let move = (fromX + (line_cmpl_x * percBreak));
        lineParts[1] = " H " + move;
        curr_pos.x = move;
    }

    if (toX < fromX) {
        // Go left
        let move = (fromX - (line_cmpl_x * percBreak));
        lineParts[1] = " H " + move;
        curr_pos.x = move;
    }

    if (toY == fromY) {
        lineParts[1] = " H " + toX;
    }

    if (toX === fromX) {
        lineParts[1] = " V " + toY;
    }

    /* 2. Part & 3. Part & 4. Part & 5. Part */

    if (toX != fromX && toY != fromY) {
        // Down & Right
        if (toY > fromY && toX > fromX) {
            // Default
            // Draw Arc & go down after
            arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 1);
            let move = (toY - radius);
            curr_pos = { x: arc[6], y: arc[7] };
            lineParts[2] = arc.join(' ');

            // Draw down
            lineParts[3] = " V " + move;
            curr_pos.y = move;

            arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 0);

            lineParts[4] = arc.join(' ');

            lineParts[5] = " H " + toX;

            if (startDir == 'vertical' && endDir == 'vertical') {
                // Modify Part 1
                curr_pos = { x: fromX, y: fromY };
                let move = (fromY + (line_cmpl_y * percBreak));
                lineParts[1] = " V " + move;
                curr_pos.y = move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 0);
                move = (toX - radius);
                curr_pos = { x: arc[6], y: arc[7] };
                lineParts[2] = arc.join(' ');

                // Draw Right
                lineParts[3] = " H " + move;
                curr_pos.x = move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 1);
                curr_pos = { x: arc[6], y: arc[7] };

                lineParts[4] = arc.join(' ');

                lineParts[5] = " V " + toY;
            }
            if (startDir == 'horizontal' && endDir == 'vertical') {
                // Modify Part 1
                curr_pos = { x: fromX, y: fromY };
                let move = (fromX + (line_cmpl_x * percBreak));
                lineParts[1] = " H " + move;
                curr_pos.x = move;

                move = (toX - radius);
                lineParts[2] = "";

                // Draw Right
                lineParts[3] = " H " + move;
                curr_pos.x = move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 1);
                curr_pos = { x: arc[6], y: arc[7] };

                lineParts[4] = arc.join(' ');

                lineParts[5] = " V " + toY;
            }
            if (startDir == 'vertical' && endDir == 'horizontal') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                move = (toY - radius);
                curr_pos.y = move;

                lineParts[2] = "";
                lineParts[3] = " V " + move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 0, 90, 0);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " H " + toX;
            }
        }

        // Down & Left
        if (toY > fromY && toX < fromX) {
            arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 180, 270, 0);
            let move = (toY - radius);
            curr_pos = { x: arc[6], y: move };
            lineParts[2] = arc.join(' ');

            // Draw down
            lineParts[3] = " V " + move;
            arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 180, 270, 1);

            lineParts[4] = arc.join(' ');

            lineParts[5] = " H " + toX;
            if (startDir == 'vertical' && endDir == 'vertical') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                arc = describeArc(curr_pos.x - radius, curr_pos.y, radius, 90, 180, 1);

                move = (toX + radius);
                curr_pos = { x: move, y: arc[7] };

                lineParts[2] = arc.join(' ');
                lineParts[3] = " H " + move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 180, 270, 0);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " V " + toY;
            }

            if (startDir == 'vertical' && endDir == 'horizontal') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                move = (toY - radius);
                curr_pos.y = move;

                lineParts[2] = "";
                lineParts[3] = " V " + move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 180, 270, 1);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " H " + toX;
            }

            if (startDir == 'horizontal' && endDir == 'vertical') {
                // Modify Part 1
                curr_pos = { x: fromX, y: fromY };
                let move = (fromX - (line_cmpl_x * percBreak));
                lineParts[1] = " H " + move;
                curr_pos.x = move;

                move = (toX + radius);
                lineParts[2] = "";

                // Draw Right
                lineParts[3] = " H " + move;
                curr_pos.x = move;

                arc = describeArc(curr_pos.x, curr_pos.y + radius, radius, 180, 270, 0);
                curr_pos = { x: arc[6], y: arc[7] };

                lineParts[4] = arc.join(' ');

                lineParts[5] = " V " + toY;
            }
        }

        // Up & Right
        if (toY < fromY && toX > fromX) {
            arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 0, 90, 0);
            let move = (toY + radius);
            curr_pos = { x: arc[6], y: move };

            lineParts[2] = arc.join(' ');
            lineParts[3] = " V " + move;

            arc = describeArc(curr_pos.x + radius, curr_pos.y, radius, 270, 360, 1);

            lineParts[4] = arc.join(' ');
            lineParts[5] = " H " + toX;

            if (startDir == 'vertical' && endDir == 'horizontal') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                move = (toY + radius);
                curr_pos.y = move;

                lineParts[2] = "";
                lineParts[3] = " V " + move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 0, 90, 1);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " H " + toX;
            }

            if (startDir == 'vertical' && endDir == 'vertical') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 0, 90, 1);

                move = (toX - radius);
                curr_pos = { x: move, y: arc[7] };

                lineParts[2] = arc.join(' ');
                lineParts[3] = " H " + move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 0, 90, 0);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " V " + toY;
            }

            if (startDir == 'horizontal' && endDir == 'vertical') {
                // Modify Part 1
                curr_pos = { x: fromX, y: fromY };
                let move = (fromX + (line_cmpl_x * percBreak));
                lineParts[1] = " H " + move;
                curr_pos.x = move;

                move = (toX - radius);
                lineParts[2] = "";

                // Draw Right
                lineParts[3] = " H " + move;
                curr_pos.x = move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 0, 90, 0);
                curr_pos = { x: arc[6], y: arc[7] };

                lineParts[4] = arc.join(' ');

                lineParts[5] = " V " + toY;
            }
        }

        // Up & Left
        if (toY < fromY && toX < fromX) {
            arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 180, 270, 1);
            let move = (toY + radius);
            curr_pos = { x: arc[6], y: move };

            lineParts[2] = arc.join(' ');
            lineParts[3] = " V " + move;

            arc = describeArc(curr_pos.x - (2 * radius), curr_pos.y - radius, radius, 0, 90, 0);

            lineParts[4] = arc.join(' ');
            lineParts[5] = " H " + toX;

            if (startDir == 'vertical' && endDir == 'horizontal') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;
                lineParts[2] = "";

                move = (toY + radius);
                curr_pos.y = move;

                arc = describeArc(curr_pos.x - (2 * radius), curr_pos.y - radius, radius, 0, 90, 0);

                lineParts[4] = arc.join(' ');
                lineParts[5] = " H " + toX;
            }

            if (startDir == 'vertical' && endDir == 'vertical') {
                // Modify Part 1
                let move = (fromY + (line_cmpl_y * percBreak));
                curr_pos = { x: fromX, y: move };

                lineParts[1] = " V " + move;

                arc = describeArc(curr_pos.x - (2 * radius), curr_pos.y - radius, radius, 0, 90, 0);

                move = (toX + radius);
                curr_pos = { x: move, y: arc[7] };

                lineParts[2] = arc.join(' ');
                lineParts[3] = " H " + move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 180, 270, 1);

                lineParts[4] = arc.join(' ');
                lineParts[5] = "  V " + toY;
            }
            if (startDir == 'horizontal' && endDir == 'vertical') {
                // Modify Part 1
                curr_pos = { x: fromX, y: fromY };
                let move = (fromX - (line_cmpl_x * percBreak));
                lineParts[1] = " H " + move;
                curr_pos.x = move;

                move = (toX + radius);
                lineParts[2] = "";

                // Draw Right
                lineParts[3] = " H " + move;
                curr_pos.x = move;

                arc = describeArc(curr_pos.x, curr_pos.y - radius, radius, 180, 270, 1);
                curr_pos = { x: arc[6], y: arc[7] };

                lineParts[4] = arc.join(' ');

                lineParts[5] = " V " + toY;
            }
        }
    }

    addAnimation(path);

    $('#' + path).attr('d', lineParts.join(' '));
}

function getShadowColor(elm) {
    let tmpShadow = $('#' + elm).css('filter').replace('drop-shadow(', '');
    let tmpShadowArr = tmpShadow.split(" ");
    let elmShadow = tmpShadowArr[0] != 'none' ? tmpShadowArr[0] + tmpShadowArr[1] + tmpShadowArr[2] + tmpShadowArr[3] : '';
    return elmShadow;
}

function showConfigBar(elm, type) {
    console.log(getCoords(elm));
    // Shadow Filter
    let elm_shadow = getShadowColor(elm);
    $('#elm_shadow').prop('checked', elm_shadow == '' ? false : true);
    $('elm_calculation').prop('checked', false);
    $('elm_convert').prop('checked', false);

    // Init Restore
    restore = {};
    // Delete current colors
    $('.elm_config').attr('style', '');
    // Hide all other elements - except this one
    $(".all_elements").addClass('faded_out');
    $("#" + elm).removeClass('faded_out');

    // Disable Listener on Config
    $(".elm_config").prop('disabled', false);

    // ID
    //$("#elm_id").val($('#' + elm).attr('id'));
    restore.id = $('#' + elm).attr('id');

    // Hide all Elements
    $('.elm_config_circle, .elm_config_text, .elm_config_rect, .elm_config_use, .elm_config_datasource, .elm_config_svg').hide();

    // Shadow for all
    restore.shadow_color = elm_shadow;
    $("#elm_shadow_color")[0].jscolor.fromString(restore.shadow_color);
    // Get SubType of text
    let subType = $('#' + elm).data('type');
    switch (type) {
        case 'rect':
            $('.elm_config_rect').show();
            restore.elm_width = $('#' + elm).attr('width');
            $("#elm_width").val(restore.elm_width);

            restore.elm_height = $('#' + elm).attr('height');
            $('#elm_height').val(restore.elm_height);

            restore.pos_x = $('#' + elm).attr('x');
            $("#elm_pos_x").val(restore.pos_x);

            restore.pos_y = $('#' + elm).attr('y');
            $("#elm_pos_y").val(restore.pos_y);

            restore.rx = $('#' + elm).attr('rx');
            $("#elm_rx").val(restore.rx);

            restore.color = $('#' + elm).css('stroke');
            $("#elm_color")[0].jscolor.fromString(restore.color);

            restore.fill = $('#' + elm).css('fill') == 'none' ? '' : $('#' + elm).css('fill');
            $("#elm_fill")[0].jscolor.fromString(restore.fill);

            restore.stroke = $('#' + elm).css('stroke-width').replace('px', '');
            $("#elm_stroke").val(restore.stroke);

            restore.url = $('#' + elm).data('url');
            $("#elm_url").val(restore.url);

            restore.frame = $('#' + elm).data('frame');
            $("#elm_frame").val(restore.frame);

            break;
        case 'circle':
            $('.elm_config_circle').show();
            restore.radius = $('#' + elm).attr('r');
            $('#elm_radius').val(restore.radius);

            restore.pos_x = $('#' + elm).attr('cx');
            $("#elm_pos_x").val(restore.pos_x);

            restore.pos_y = $('#' + elm).attr('cy');
            $("#elm_pos_y").val(restore.pos_y);

            restore.color = $('#' + elm).css('stroke');
            $("#elm_color")[0].jscolor.fromString(restore.color);

            restore.fill = $('#' + elm).css('fill') == 'none' ? '' : $('#' + elm).css('fill');
            $("#elm_fill")[0].jscolor.fromString(restore.fill);

            restore.stroke = $('#' + elm).css('stroke-width').replace('px', '');
            $("#elm_stroke").val(restore.stroke);

            restore.url = $('#' + elm).data('url');
            $("#elm_url").val(restore.url);

            restore.frame = $('#' + elm).data('frame');
            $("#elm_frame").val(restore.frame);

            break;
        case 'text':
            $('.elm_config_text').show();
            $('.elm_config_text_not_ds').show();
            if (subType == 'datasource') {
                restore.unit = $('#' + elm).data('unit');
                $("#elm_unit").val(restore.unit);

                restore.source = $('#' + elm).data('source');
                getDataSources('elm_source', restore.source);

                restore.calculate_kw = $('#' + elm).data('calculate_kw');
                $("#elm_calculation").prop('checked', restore.calculate_kw === true ? true : false);

                restore.convert = $('#' + elm).data('convert');
                $("#elm_convert").prop('checked', restore.convert === true ? true : false);

                restore.threshold = $('#' + elm).data('threshold');
                $("#elm_threshold").val(restore.threshold);

                restore.decimal_places = $('#' + elm).data('decimal_places');
                $('#elm_decimal_places').val(restore.decimal_places);

                $('.elm_config_datasource').show();

                // Hide the Text, because not necessary
                $('.elm_config_text_not_ds').hide();
            }
            restore.pos_x = $('#' + elm).attr('x');
            $("#elm_pos_x").val(restore.pos_x);

            restore.pos_y = $('#' + elm).attr('y');
            $("#elm_pos_y").val(restore.pos_y);

            restore.color = $('#' + elm).css('stroke');
            $("#elm_color")[0].jscolor.fromString(restore.color);

            restore.fill = $('#' + elm).css('fill') == 'none' ? '' : $('#' + elm).css('fill');
            $("#elm_fill")[0].jscolor.fromString(restore.fill);

            restore.text = $('#' + elm).html();
            $("#elm_text").val(restore.text);

            restore.font = $('#' + elm).css('font-family');
            $("#elm_font").val(restore.font);

            restore.degree = getRotationDegrees($("#" + elm));

            restore.font_size = $('#' + elm).css('font-size').replace('px', '');
            $('#elm_font_size').val(restore.font_size);
            break;
        case 'use':
            restore.animation = $('#' + elm).data('animation');
            getDataSources('elm_animation', restore.animation);

            restore.animation_properties = $('#' + elm).data('animation_properties');
            $('#elm_animation_properties').val(restore.animation_properties);

            restore.threshold = $('#' + elm).data('threshold');
            $("#elm_threshold").val(restore.threshold);

            $('.elm_config_use').show();
            // Show the line as well
            $('#' + elm.replace('anim', 'line')).removeClass('faded_out');

            restore.color = $('#' + elm).css('stroke');
            $("#elm_color")[0].jscolor.fromString(restore.color);

            restore.line_color = $('#' + elm.replace('anim', 'line')).css('stroke');
            $("#elm_line_color")[0].jscolor.fromString(restore.line_color);

            restore.startSlot = $('#' + elm.replace('anim_', '')).data('start-slot');
            restore.endSlot = $('#' + elm.replace('anim_', '')).data('end-slot');
            break;
        case 'svg':
            $('.elm_config_svg').show();
            restore.elm_width = $('#' + elm).attr('width');
            $("#elm_width").val(restore.elm_width);

            restore.elm_height = $('#' + elm).attr('height');
            $('#elm_height').val(restore.elm_height);

            restore.pos_x = $('#' + elm).attr('x');
            $("#elm_pos_x").val(restore.pos_x);

            restore.pos_y = $('#' + elm).attr('y');
            $("#elm_pos_y").val(restore.pos_y);

            restore.icon = $('#' + elm).data('icon')
            $("#elm_icon").val(restore.icon);

            restore.color = $('#' + elm).css('color');
            $("#elm_color")[0].jscolor.fromString(restore.color);

            restore.fill = $('#' + elm).css('fill') == 'none' ? '' : $('#' + elm).css('fill');
            $("#elm_fill")[0].jscolor.fromString(restore.fill);
    }

    // Show Bar
    $('#config_bar').addClass('show');

    $(".elm_config").off().on('input change', function (event) {
        // Set the reminder for configuration changes
        globalConfigChanged = true;

        // As fill can be 'none'
        let elm_fill = $('#elm_fill').val() ? $('#elm_fill').val() : 'none';

        // Set shadow
        if (event.target.id == 'elm_shadow') {
            if ($('#elm_shadow_color').val() == '') {
                $('#elm_shadow_color')[0].jscolor.fromString('rgba(0, 0, 0, 0.7)');
            }
        }

        if (event.target.id == 'elm_shadow_color') {
            $('#elm_shadow').prop('checked', true);
        }

        // Shadow Template
        let filterVal = 'drop-shadow(0px 3px 3px ' + $('#elm_shadow_color').val() + ')';

        // Update the line while changing positions
        let connected_elements = $("path[id*=" + restore.id + "]");
        if (connected_elements.length > 0) {
            connected_elements.each(function (index) {
                let tmp = connected_elements[index].id.split("_");
                connectElements(connected_elements[index].id, tmp[1], tmp[2]);
            })
        }

        // Check, if elements run out SVG
        let svg_height = parseInt($('#svg_config').attr('height'));
        let svg_width = parseInt($('#svg_config').attr('width'));
        let circle_radius = parseInt($('#elm_radius').val());
        let stroke_width = parseInt($('#elm_stroke').val()) / 2;
        let font_size = parseInt($('#elm_font_size').val());
        let maxX, maxY;

        switch (type) {
            case 'rect':
                maxX = svg_width - $("#elm_width").val() - stroke_width;
                maxY = svg_height - $("#elm_height").val() - stroke_width;
                if ($("#elm_pos_x").val() - stroke_width >= 0 && $("#elm_pos_x").val() <= maxX && $("#elm_pos_y").val() - stroke_width >= 0 && $("#elm_pos_y").val() <= maxY) {
                    $("#" + elm).attr({
                        "width": $("#elm_width").val(),
                        "height": $("#elm_height").val(),
                        "rx": $("#elm_rx").val(),
                        "x": $("#elm_pos_x").val(),
                        "y": $("#elm_pos_y").val()
                    });
                } else {
                    $(this).val() > stroke_width ? $('#' + event.target.id).val($(this).val() - 1) : $('#' + event.target.id).val(stroke_width);
                }
                // Data
                $("#" + elm).data({
                    'frame': $("#elm_frame").val(),
                    'url': $("#elm_url").val()
                });
                // CSS
                $("#" + elm).css({
                    "stroke-width": $("#elm_stroke").val() + 'px',
                    "stroke": $('#elm_color').val(),
                    "fill": elm_fill
                });

                // Check for Shadow
                if ($('#elm_shadow').is(':checked')) {
                    $("#" + elm).css({
                        'filter': filterVal
                    });
                } else {
                    $("#" + elm).css({
                        'filter': ''
                    });
                }

                break;
            case 'circle':
                maxX = svg_width - circle_radius - stroke_width;
                maxY = svg_height - circle_radius - stroke_width;
                if ($("#elm_pos_x").val() - stroke_width - circle_radius >= 0 &&
                    $("#elm_pos_y").val() - stroke_width - circle_radius >= 0 &&
                    $("#elm_pos_x").val() <= maxX &&
                    $("#elm_pos_y").val() - stroke_width >= 0 &&
                    $("#elm_pos_y").val() <= maxY) {
                    $("#" + elm).attr({
                        "r": $("#elm_radius").val(),
                        "cx": $("#elm_pos_x").val(),
                        "cy": $("#elm_pos_y").val()
                    });
                } else {
                    if ($("#elm_pos_x").val() - stroke_width - circle_radius < 0 || $("#elm_pos_y").val() - stroke_width - circle_radius < 0) {
                        $('#' + event.target.id).val(parseInt($(this).val()) + 1);
                    } else {
                        $('#' + event.target.id).val(parseInt($(this).val()) - 1);
                    }
                }
                // Data
                $("#" + elm).data({
                    'frame': $("#elm_frame").val(),
                    'url': $("#elm_url").val()
                });
                // CSS
                $("#" + elm).css({
                    "stroke-width": $("#elm_stroke").val() + 'px',
                    "stroke": $('#elm_color').val(),
                    "fill": elm_fill
                });

                // Check for Shadow
                if ($('#elm_shadow').is(':checked')) {
                    $("#" + elm).css({
                        'filter': filterVal
                    });
                } else {
                    $("#" + elm).css({
                        'filter': ''
                    });
                }

                break;
            case 'text':
                maxX = svg_width - $('#elm_font_size').val();
                maxY = svg_height - $('#elm_font_size').val() / 2;
                if ($("#elm_pos_x").val() - font_size >= 0 && $("#elm_pos_x").val() <= maxX && $("#elm_pos_y").val() - font_size / 2 >= 0 && $("#elm_pos_y").val() <= maxY) {
                    $("#" + elm).attr({
                        "x": $("#elm_pos_x").val(),
                        "y": $("#elm_pos_y").val()
                    });
                } else {
                    if ($("#elm_pos_x").val() - font_size < 0 || $("#elm_pos_y").val() - font_size / 2 < 0) {
                        $('#' + event.target.id).val(parseInt($(this).val()) + 1);
                    } else {
                        $('#' + event.target.id).val(parseInt($(this).val()) - 1);
                    }
                }
                $("#" + elm).html($("#elm_text").val());
                // Data
                $("#" + elm).data({
                    unit: $("#elm_unit").val(),
                    source: $("#elm_source").val(),
                    threshold: $("#elm_threshold").val(),
                    decimal_places: $("#elm_decimal_places").val(),
                    calculate_kw: $("#elm_calculation").prop('checked'),
                    convert: $("#elm_convert").prop('checked')
                });

                $("#" + elm).css({
                    "font-family": $("#elm_font").val(),
                    "font-size": $("#elm_font_size").val() + 'px',
                    "stroke": $('#elm_color').val(),
                    "fill": elm_fill
                });

                // Check for Shadow
                if ($('#elm_shadow').is(':checked')) {
                    $("#" + elm).css({
                        'filter': filterVal
                    });
                } else {
                    $("#" + elm).css({
                        'filter': ''
                    });
                }

                break;
            case 'use':
                $("#" + elm).data({
                    threshold: $("#elm_threshold").val(),
                    animation: $("#elm_animation").val(),
                    animation_properties: $("#elm_animation_properties").val()
                });
                $("#" + elm).css({
                    "stroke": $('#elm_color').val()
                });
                $("#" + elm.replace('anim', 'line')).css({
                    "stroke": $('#elm_line_color').val()
                });
                break;
            case 'svg':
                $("#" + elm).attr({
                    "width": $("#elm_width").val(),
                    "height": $("#elm_height").val(),
                    "x": $("#elm_pos_x").val(),
                    "y": $("#elm_pos_y").val(),
                });

                $("#" + elm).css('color', $('#elm_color').val());

                // Check for Shadow
                if ($('#elm_shadow').is(':checked')) {
                    $("#" + elm).css({
                        'filter': filterVal
                    });
                } else {
                    $("#" + elm).css({
                        'filter': ''
                    });
                }

                // Child
                /*
                $("#" + elm).children().attr({
                    'stroke': $('#elm_color').minicolors('value'),
                    "fill": elm_fill
                });
                */
                break;
        }
    });

    $('#elm_icon').on('input', function () {
        $(this).autocomplete({
            position: {
                my: "right top",
                at: "right bottom"
            },
            source: function (request, response) {
                $.ajax({
                    minLength: 1,
                    url: 'https://api.iconify.design/search?',
                    type: "GET",
                    data: { query: request.term },
                    success: function (data) {
                        response($.map(data.icons, function (item) {
                            return {
                                label: item
                            };
                        }));
                    }
                });
            },
            select: function (event, ui) {
                iconHandler(ui.item.value);
                return ui.item.value;
            }
        }).autocomplete("instance")._renderItem = function (ul, item) {
            return $("<li class='ui-menu-item'>")
                .append(
                    "<div class='ui-menu-item-wrapper'><span class='iconify' data-width='24' data-icon='" + item.label + "'></span><span style='font-weight: normal; padding-left:10px;'>" +
                    item.label + "</span></div>"
                )
                .appendTo(ul);
        };
    });

    $("#restore_element").off().click(function () {
        // Re-attach blur
        this.blur();

        // Check, if Element was deleted
        if ($("#" + elm).length === 0) {
            // Rebuild the Element
            let elm_fill = $('#elm_fill').val() ? $('#elm_fill').val() : 'none';

            addElement({
                format: type,
                subType: subType,
                id: restore.id,
                radius: $("#elm_radius").val(),
                width: $("#elm_width").val(),
                height: $("#elm_height").val(),
                rx: $("#elm_rx").val(),
                stroke: $("#elm_stroke").val(),
                pos_x: $("#elm_pos_x").val(),
                pos_y: $("#elm_pos_y").val(),
                color: $("#elm_color").val(),
                fill: elm_fill,
                icon: $("#elm_icon").val(),
                connPoint1: restore.startSlot,
                connPoint2: restore.endSlot,
                text: $('#elm_text').val(),
                font_size: $('#elm_font_size').val(),
                font_family: $('#elm_font').val(),
                unit: $('#elm_unit').val(),
                source: $('#elm_source').val(),
                degree: restore.degree,
                shadow: $('#elm_shadow_color').val(),
                animation: $('#elm_animation').val(),
                animation_properties: $('#elm_animation_properties'),
                threshold: $('#elm_threshold').val(),
                calculate_kw: $('#elm_calculation').prop('checked'),
                convert: $('#elm_convert').prop('checked'),
                decimal_places: $('#elm_decimal_places').val(),
                url: $('#elm_url').val(),
                frame: $('#elm_frame').val()
            });

            if ($("#" + elm).length > 0) {
                successMessage('Element restored!');
                // Activate Config fields
                $('.elm_config').prop("disabled", false);
            } else {
                failedMessage('An Error occured, while restoring the Element!');
                // Deactivate Config fields
                $('.elm_config').prop("disabled", true);
            }

        } else {
            // Set Values back to fields
            Object.entries(restore).forEach(entry => {
                const [key, value] = entry;
                $("#elm_" + key).val(value);
            });

            // As fill can be 'none'
            let elm_fill = restore.fill ? restore.fill : 'none';

            // Shadow
            let filterVal = '';
            if (restore.shadow_color) {
                filterVal = 'drop-shadow(0px 3px 3px ' + restore.shadow_color + ')';
                // Check for Shadow
                $('#elm_shadow').prop('checked', true);
            } else {
                $('#elm_shadow').prop('checked', false);
            }

            // Reset the colors
            $("#elm_color")[0].jscolor.fromString(restore.color);
            $("#elm_line_color")[0].jscolor.fromString(restore.line_color);
            $("#elm_shadow_color")[0].jscolor.fromString(restore.shadow_color);

            switch (type) {
                case 'rect':
                    $("#" + elm).attr({
                        width: restore.width,
                        height: restore.height,
                        rx: restore.rx,
                        x: restore.pos_x,
                        y: restore.pos_y
                    });
                    $("#" + elm).data({
                        url: restore.url,
                        frame: restore.frame
                    });
                    $("#" + restore.id).css({
                        "stroke-width": restore.stroke + 'px',
                        stroke: restore.color,
                        fill: elm_fill,
                        filter: filterVal
                    });
                    break;
                case 'circle':
                    $("#" + elm).attr({
                        r: restore.radius,
                        cx: restore.pos_x,
                        cy: restore.pos_y
                    });
                    $("#" + elm).data({
                        url: restore.url,
                        frame: restore.frame
                    });
                    $("#" + restore.id).css({
                        'stroke-width': restore.stroke + 'px',
                        stroke: restore.color,
                        fill: elm_fill,
                        filter: filterVal
                    });
                    break;
                case 'text':
                    $("#" + elm).attr({
                        x: restore.pos_x,
                        y: restore.pos_y
                    });
                    $("#" + elm).html(restore.text);
                    $("#" + elm).css({
                        "font-family": restore.font,
                        "font-size": restore.font_size + 'px',
                        stroke: restore.color,
                        fill: elm_fill,
                        'transform-box': 'fill-box',
                        transform: 'rotate(' + restore.degree + 'deg)',
                        filter: filterVal
                    });
                    if (subType == 'datasource') {
                        // Switches
                        $("#elm_calculation").prop('checked', restore.calculate_kw === true ? true : false);
                        $("#elm_convert").prop('checked', restore.convert === true ? true : false);
                        $("#" + elm).data({
                            unit: restore.unit,
                            source: restore.source,
                            calculate_kw: restore.calculate_kw,
                            convert: restore.convert,
                            threshold: restore.threshold,
                            decimal_places: restore.decimal_places
                        });
                    }
                    break;
                case 'use':
                    console.log(elm.replace('anim', 'line'));
                    $("#" + elm).data({
                        animation: restore.animation,
                        animation_properties: restore.animation_properties
                    })
                    $("#" + elm).css({
                        stroke: restore.color
                    });
                    $("#" + elm.replace('anim', 'line')).css({
                        stroke: restore.line_color,
                        filter: filterVal
                    });
                    break;
                case 'svg':
                    iconHandler(restore.icon);
                    $("#" + elm).attr({
                        width: restore.width,
                        height: restore.height,
                        x: restore.pos_x,
                        y: restore.pos_y
                    });
                    $("#" + elm).css({
                        color: restore.color,
                        filter: filterVal
                    });

                    // Child
                    /*
                    $("#" + elm).children().attr({
                        'stroke': $('#def_elm_color').minicolors('value')
                    });
                    $("#" + elm).children().attr({
                        'stroke': $('#elm_color').minicolors('value'),
                        "fill": elm_fill
                    });
                    */
                    break;
            }
            // Update the line while changing positions
            let connected_elements = $("path[id*=" + restore.id + "]");
            if (connected_elements.length > 0) {
                connected_elements.each(function (index) {
                    let tmp = connected_elements[index].id.split("_");
                    connectElements(connected_elements[index].id, tmp[1], tmp[2]);
                })
            }
        }
    });

    // Delete Handler
    $("#delete_element").off().click(function () {
        // Re-attach blur
        this.blur();

        // Deactivate Config fields
        $('.elm_config').prop("disabled", true);

        if (type == 'use') {
            // Need to delete the path as well!
            $('#' + elm.replace('anim', 'line')).remove();

            // Need to delete the def as well
            $('#' + elm.replace('anim_', '')).remove();

            // Remove the Animation
            $('#' + elm).remove();
            successMessage('Line deleted!');
        } else {
            // Check, if the Element has connections
            let connected_elements = $("path[id*=" + restore.id + "]");
            if (connected_elements.length > 0) {
                failedMessage('Element can not be deleted! Existing connection!');
            } else {
                $('#' + elm).remove();
                successMessage('Element deleted!');
            }
        }
    });

    // Rotate Text
    $("#rotate_cw, #rotate_ccw").off().click(function (event) {
        // Check, if element was deleted
        if ($("#" + elm).length > 0) {
            let source = event.target.id == true ? event.target.id : $(this).closest('a').attr('id');
            // Collect the degree
            let degree = source == 'rotate_cw' ? 45 : -45;
            let tmpDegree = getRotationDegrees($("#" + elm));

            tmpDegree = tmpDegree + degree;
            $("#" + elm).css({
                'transform-box': 'fill-box',
                'transform': 'rotate(' + tmpDegree + 'deg)'
            });
        } else {
            console.log("Element deleted! No dgree possible!");
        }
    });

    function iconHandler(icon) {
        let s = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
        s.setAttribute('x', $('#' + elm).attr('x'));
        s.setAttribute('y', $('#' + elm).attr('y'));
        s.setAttribute('data-width', $('#' + elm).attr('width'));
        s.setAttribute('data-height', $('#' + elm).attr('height'));
        s.setAttribute('data-icon', icon);
        s.setAttribute('class', 'iconify type_icon all_elements added_elements draggable draggable-group');
        s.setAttribute('id', restore.id);
        s.setAttribute('style', 'color: ' + restore.color + ';');
        // Remove old Element
        $("#" + elm).remove();
        // Append new created one
        $(s).appendTo("#placeholder_icons");
    }
}

function hideConfigBar() {
    // Remove Class
    $('.all_elements').removeClass('faded_out');
    // Remove the ConfigBar - itself
    $('#config_bar').removeClass('show').scrollTop(0);
    // Remove bindings
    $('.elm_config').off().val('');
    // Select 1st tab
    $('#tab1_config').prop('checked', true);

    // Remove Autocomplete
    if ($('#elm_icon').hasClass('ui-autocomplete-input')) {
        $('#elm_icon').autocomplete("destroy");
    }
}

function hideIframe() {
    $('#loading').fadeOut("fast", function () {
        $('#overlay_frame').attr('src', '');
        $("#display_container").hide();
    })
}

function addElement(options) {
    // Add Element to Coords
    let shadow = '';
    let classes = 'all_elements added_elements draggable';
    if (options.shadow) {
        shadow = ' filter: drop-shadow(0px 3px 3px ' + options.shadow + ');';
    }
    switch (options.format) {
        case 'rect':
            let r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            r.setAttribute('x', options.pos_x);
            r.setAttribute('y', options.pos_y);
            r.setAttribute('width', options.width);
            r.setAttribute('height', options.height);
            r.setAttribute('rx', options.rx);
            r.setAttribute('class', classes + ' type_rect connector');
            r.setAttribute('data-url', options.url);
            r.setAttribute('data-frame', options.frame);
            r.setAttribute('id', options.id);
            r.setAttribute('style', 'stroke: ' + options.color + '; stroke-width: ' + options.stroke + 'px; fill:' + options.fill + ';' + shadow);
            $(r).appendTo("#placeholder_elements");

            break;
        case 'circle':
            let c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', options.pos_x);
            c.setAttribute('cy', options.pos_y);
            c.setAttribute('r', options.radius);
            c.setAttribute('class', classes + ' type_circle connector');
            c.setAttribute('data-url', options.url);
            c.setAttribute('data-frame', options.frame);
            c.setAttribute('id', options.id);
            c.setAttribute('style', 'stroke: ' + options.color + '; stroke-width: ' + options.stroke + 'px; fill:' + options.fill + ';' + shadow);
            $(c).appendTo("#placeholder_elements");
            break;
        case 'text':
            let t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            let angles = '';
            if (options.degree) {
                angles = ' transform-box: fill-box; transform: rotate(' + options.degree + 'deg)';
            }
            t.setAttribute('x', options.pos_x);
            t.setAttribute('y', options.pos_y);
            t.setAttribute('id', options.id);
            t.setAttribute('dominant-baseline', 'central');
            t.setAttribute('style', 'stroke: ' + options.color + '; fill: ' + options.fill + '; font-family: ' + options.font_family + '; font-size: ' + options.font_size + 'px;' + angles + shadow);
            if (options.subType == 'datasource') {
                t.setAttribute('data-unit', options.unit);
                t.setAttribute('data-type', 'datasource');
                t.setAttribute('class', classes + ' type_datasource');
                t.setAttribute('data-source', options.source);
                t.setAttribute('data-threshold', options.threshold);
                t.setAttribute('data-calculate_kw', options.calculate_kw);
                t.setAttribute('data-convert', options.convert);
                t.setAttribute('data-decimal_places', options.decimal_places);
            } else {
                t.setAttribute('data-type', 'text');
                t.setAttribute('class', classes + ' type_text');
            }

            t.innerHTML = options.text;
            $(t).appendTo("#placeholder_text");
            break;
        case 'svg':
        case 'icon':
            let i = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
            i.setAttribute('x', options.pos_x);
            i.setAttribute('y', options.pos_y);
            i.setAttribute('class', classes + ' type_icon draggable-group iconify');
            i.setAttribute('id', options.id);
            i.setAttribute('data-icon', options.icon);
            i.setAttribute('data-width', options.width);
            i.setAttribute('data-height', options.height);
            i.setAttribute('data-type', 'icon');
            i.setAttribute('style', 'color: ' + options.color + ';' + shadow);
            $(i).appendTo("#placeholder_icons");
            break;
        case 'use':
            // Add Def
            let path = options.id.replace('anim_', '');
            let tmp = path.split("_");
            let u = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            u.setAttribute('id', path);
            u.setAttribute('class', 'type_def');
            u.setAttribute('data-start-slot', options.connPoint1);
            u.setAttribute('data-end-slot', options.connPoint2);
            $(u).appendTo('#placeholder_defs');

            // Use for the Line
            addElement({
                format: 'line',
                id: 'line_' + path,
                color: configuration.line.stroke,
                href: '#' + path
            });

            // Connect the Element
            connectElements(path, tmp[1], tmp[2]);
            break;
        case 'def':
            // For configuration restore
            let d = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            d.setAttribute('id', options.id);
            d.setAttribute('class', 'type_def');
            d.setAttribute('data-start-slot', options.connPoint1);
            d.setAttribute('data-end-slot', options.connPoint2);
            d.setAttribute('d', options.d);
            $(d).appendTo('#placeholder_defs');
            break;
        case 'line':
            let l = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            l.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', options.href);
            l.setAttribute('id', options.id);
            l.setAttribute('class', 'line type_line all_elements');
            l.setAttribute('style', 'stroke: ' + options.color + ';');
            $(l).appendTo('#placeholder_lines');
            break;
        case 'animation':
            classes = 'type_animation all_elements anim_element';
            if ($('#enable_animation').prop('checked')) {
                classes += " animation";
            } else {
                classes += " no_animation";
            }
            let a = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', options.href);
            a.setAttribute('id', options.id);
            a.setAttribute('class', classes);
            a.setAttribute('style', 'stroke: ' + options.color + ';');
            a.setAttribute('data-animation', options.animation);
            a.setAttribute('data-animation_properties', options.animation_properties);
            a.setAttribute('data-threshold', options.threshold);
            $(a).appendTo('#placeholder_animations');
            // Disable Events while in Display-Mode
            if (!displayMode) {
                $('.anim_element').off().click(function (event) {
                    showConfigBar(event.target.id, event.target.tagName.toLowerCase());
                });
            }
            break;
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function getRandomRGBA() {
    var o = Math.round, r = Math.random, s = 255;
    return 'rgba(' + o(r() * s) + ',' + o(r() * s) + ',' + o(r() * s) + ',1)';
}

function addDataSourceRow(key, ds_source, ds_alias) {
    // First, Close all open Edit
    $('.btn-cancel').trigger('click');
    // Check, if it is already there
    let dataOK = true;
    $(".data-table tbody tr").each(function () {
        if ($('td:eq(1)', this).text().toLowerCase() == ds_source.toLowerCase()) {
            $(this).effect("highlight", {
                color: "lightgreen"
            }, 3000);
            dataOK = false;
            return false;
        }
        console.log($('td:eq(1)', this).text());
    });
    if (dataOK) {
        if (key == -1) {
            console.log("Need new Key!");
            let tmpMaxID = -1;
            // Generate a new ID
            $(".data-table tbody tr").each(function () {
                tmpMaxID = Math.max($(this).data('id'), tmpMaxID);
            });
            tmpMaxID++;
            console.log("Found: " + tmpMaxID);
            key = tmpMaxID;
        }
        let tableCell =
            "<tr data-source='" + ds_source + "' data-alias='" + ds_alias + "' data-id='" + key + "'>" +
            "<td>" + ds_alias + "</td><td>" + ds_source + "</td>" +
            "<td><button class='all_datasource ds_buttons btn-edit'><span class='iconify' data-height='24' data-icon='mdi:pencil'>Edit</span></button>" +
            "<button class='all_datasource ds_buttons btn-delete'><span class='iconify red_icon' data-height='24' data-icon='mdi:delete'>Delete</span></button>" +
            "</td></tr>";
        $(".data-table tbody").append(tableCell);
        $(".data-table tbody").find('tr:last-child').hide().fadeIn('slow');
        $('#ds_tmp_line').remove();
    }
}

$(function () {
    $('.tt-element').tooltip({
        position: { my: "left", at: "right+10% center", collision: "flipfit" },
        content: function () {
            return $(this).attr("title");
        }
    });

    $(document).tooltip({
        position: { my: "left", at: "left+75 center", collision: "flipfit" },
        content: function () {
            return $(this).attr("title");
        }

    });

    $('.tt-element').click(function () {
        $(".ui-tooltip").fadeOut();
    });

    $(".line_preview").change(function () {
        linePreview(this.id);
    });

    $(".svg_size_value").on('input change', function (event) {
        if ($(this).val() <= 0 && $(this).val() != '') {
            $(this).val(1);
        } else {
            $("#svg_width_slider").val($("#svg_width_value").val());
            $("#svg_height_slider").val($("#svg_height_value").val());
            resizeSVG();
        }
    });


    $(".svg_size_slider").on('input change', function () {
        $("#svg_height_value").val($("#svg_height_slider").val());
        $("#svg_width_value").val($("#svg_width_slider").val());
        resizeSVG();
    });

    // Align Element
    $(".align_elements").click(function (event) {
        globalConfigChanged = true;
        // Reset
        $('.added_elements').removeClass('alignable').addClass('draggable');
        $(".all_elements, .align_elements").removeClass('faded_out');

        let elm = event.target.id;
        let startCoord, positions;

        if (elm == '') {
            elm = $(this).closest('a').attr('id');
        }

        $('.align_elements:not(#' + elm + ')').addClass('faded_out');

        // Show Cancel Button
        $('#align_elements').show();

        // Disable Connect Button
        $('#connect_elements').prop('disabled', true);

        // Hide the configBar
        hideConfigBar();

        // Fade out all elements, which are not alignable
        $(".all_elements").addClass('faded_out');

        // Fade back in, Elements, which are alignable and add class
        $(".added_elements").removeClass('draggable faded_out').addClass('alignable');
        $(".type_icon").removeClass('draggable-group').addClass('alignable');

        $("#ex_how_align").html("Now choose the reference element! <img src='img/icon_help.png' style='vertical-align: bottom;' title='You need to select a reference element for aligning. Afterwards, choose each element, which should be aligned the same.'>");

        $('.alignable').off().click(function (event) {
            let id = event.target.id;
            if (positions == null) {
                id = event.target.id;
                if (id == '') {
                    id = event.target.parentNode.id;
                }
                startCoord = getCoords(id);
                positions = getSlots(startCoord);

                // Change Tipp
                $("#ex_how_align").html('Reference element selected. Choose each element now!');
            } else {
                // Reference there - start align
                let tagName = event.target.tagName.toLowerCase();
                id = event.target.id;
                if (id == '') {
                    id = event.target.parentNode.id;
                    tagName = event.target.parentNode.tagName;
                }

                console.log(tagName);

                switch (elm.replace('align_', '')) {
                    case 'center':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cx', positions.top.x);
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('x', positions.top.x - Math.floor(parseInt($(this).attr('width')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('x', positions.top.x);
                                break;
                        }
                        break;
                    case 'left':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cx', positions.left.x + parseInt($(this).attr('r')) + Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('x', positions.left.x + Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('x', positions.left.x + Math.floor(event.target.getComputedTextLength() / 2));
                                break;
                        }
                        break;
                    case 'right':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cx', positions.right.x - parseInt($(this).attr('r')) - Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('x', positions.right.x - Math.floor(parseInt($(this).attr('width'))) - Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('x', positions.right.x - Math.floor(event.target.getComputedTextLength() / 2));
                                break;
                        }
                        break;
                    case 'vcenter':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cy', positions.right.y);
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('y', positions.right.y - Math.floor(parseInt($(this).attr('height')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('y', positions.right.y);
                                break;
                        }
                        break;
                    case 'top':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cy', positions.top.y + parseInt($(this).attr('r')) + Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('y', positions.top.y + Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('y', positions.top.y + Math.floor(parseInt($(this).css('font-size')) / 2));
                                break;
                        }
                        break;
                    case 'bottom':
                        switch (tagName) {
                            case 'circle':
                                $('#' + id).attr('cy', positions.bottom.y - parseInt($(this).attr('r')) - Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'rect':
                            case 'svg':
                                $('#' + id).attr('y', positions.bottom.y - Math.floor(parseInt($(this).attr('height'))) - Math.floor(parseInt($(this).css('stroke-width')) / 2));
                                break;
                            case 'text':
                                $('#' + id).attr('y', positions.bottom.y - Math.floor(parseInt($(this).css('font-size')) / 2));
                                break;
                        }
                        break;
                }
                console.log(positions);

                // Check, if we have any line connection
                let connected_elements = $("path[id*=" + id + "]");
                if (connected_elements.length > 0) {
                    connected_elements.each(function (index) {
                        let tmp = connected_elements[index].id.split("_");
                        connectElements(connected_elements[index].id, tmp[1], tmp[2]);
                    })
                }
            }
        });
    });

    $('#align_elements').click(function () {
        // Re-add Text
        $("#ex_how_align").html('Choose an alignment and select a reference element');

        // Enable Connect Button
        $('#connect_elements').prop('disabled', false);

        // Hide Cancel Button
        $(this).hide();

        // Remove Event
        $('.alignable').off();

        // Remove the classes
        $('.added_elements').removeClass('alignable').addClass('draggable');
        $(".type_icon").removeClass('alignable').addClass('draggable-group');
        $(".all_elements, .align_elements").removeClass('faded_out');
    });

    // Add a new element
    $(".add_element").click(function (event) {
        // Get max ID
        if ($('.added_elements').length === 0) {
            max_elm_id = 0;
        } else {
            $('.added_elements').each(function () {
                max_elm_id = Math.max(this.id, max_elm_id);
            });
            max_elm_id++;
        }

        // Init
        let options = {
            id: max_elm_id,
            radius: 50,
            width: 100,
            height: 100,
            rx: 10,
            stroke: 5,
            pos_x: 50 + getRandomInt(50),
            pos_y: 50 + getRandomInt(50),
            color: getRandomRGBA(),
            fill: 'none',
            font_size: 20,
            font_family: '"Arial", sans-serif',
            unit: 'kW'
        }

        let elm = event.target.id;

        if (elm == '') {
            elm = $(this).closest('a').attr('id');
        }

        // Which Element?
        switch (elm) {
            case 'add_circle':
                options.format = 'circle';
                options.frame = '_overlay';
                options.url = '';
                break;
            case 'add_rect':
                options.format = 'rect';
                options.frame = '_overlay';
                options.url = '';
                break;
            case 'add_text':
                options.format = 'text';
                options.text = 'Text';
                break;
            case 'add_datasource':
                options.threshold = 0;
                options.calculate_kw = false;
                options.convert = false;
                options.decimal_places = 0;
                options.format = 'text';
                options.subType = 'datasource';
                options.text = 'Datasource ' + max_elm_id;
                options.source = '-1';
                break;
            case 'add_icon':
                options.format = 'icon'
                options.width = 24;
                options.height = 24;
                options.icon = 'mdi:omega';
                break;
        }

        if (options.format == 'text' || options.format == 'datasource') {
            // fill the text with the same color and reset the color
            options.fill = options.color;
            options.color = '';
        }

        addElement(options);
    });

    $('#enable_animation').on('click change', function () {
        if ($(this).is(':checked')) {
            $('.anim_element').removeClass('no_animation').addClass('animation');
        } else {
            $('.anim_element').removeClass('animation').addClass('no_animation');
        }
    });

    $('#enable_grid').on('click change', function () {
        if ($(this).is(':checked')) {
            $('#help_grid').fadeIn('fast');
        } else {
            $('#help_grid').fadeOut('fast');
        }
    });

    // Close config panel
    $("#config_close").click(function () {
        hideConfigBar();
    });

    // Close Overlay Frame
    $("#iframe_close").click(function () {
        hideIframe();
    });

    $('#enable_area_catch').on('click change', function () {
        if ($(this).is(':checked')) {
            $('#svg_preview').addClass('svg_preview_catch');
        } else {
            $('#svg_preview').removeClass('svg_preview_catch');
        }
    });

    $("#connect_elements").click(function () {
        globalConfigChanged = true;
        let connElement1, connElement2, connPoint1, connPoint2;
        if ($(this).val() == 'Done') {
            // Destroy the connection mode
            $(".clickable").off();
            $('.added_elements').removeClass('clickable').addClass('draggable');
            $(".all_elements").removeClass('faded_out no_click');
            $("#ex_how_connect").html("Click the button above to connect 2 elements.");
            $(this).val('Connect').removeClass('red');
            // Remove Listener
            $(".clickable").off();
            // Remove connection points
            showConnectionPoints(false);
        } else {
            if ($('.connector').length >= 2) {
                hideConfigBar();
                showConnectionPoints();
                $("#ex_how_connect").html("Now choose the first element! You can choose the Element or the ConnectionPoints! <img src='img/icon_help.png' style='vertical-align: bottom;' title='<b>Element:</b><br>If you choose the element itself (click in the middle), the line will always use the shortest distance to the element.<br><b>ConnectionPoint:</b><br>If you choose a connectionPoint, the connection will stay at that choosen one.'>");
                // Fade out all elements, which are not connectable
                $(".all_elements").addClass('faded_out no_click');

                $('.connector').removeClass('draggable faded_out no_click').addClass('clickable');

                // Remove all actions from clickable elements and add new for connecting
                $(".clickable").off().click(function () {
                    let id = $(this).attr('id');
                    if (!id) {
                        // Click on connectionPoint
                        id = $(this).data('element');
                    }
                    if (connElement1 == null) {
                        connElement1 = id;
                        connPoint1 = $(this).data('slot');
                        $("#ex_how_connect").html("First Element selected!<br>Please choose the next one!");
                    } else {
                        if (connElement1 == id) {
                            $("#ex_how_connect").html("Do not select the same Element!");
                            connElement2 = null;
                            connPoint2 = null;
                        } else {
                            connElement2 = id;
                            connPoint2 = $(this).data('slot');

                            // Check, if connection already exists
                            let path = 'path_' + connElement1 + '_' + connElement2;
                            if ($("#" + path).length > 0) {
                                failedMessage('This connection already exists!');
                            } else {
                                // Add Def
                                let p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                p.setAttribute('id', path);
                                p.setAttribute('class', 'type_def');
                                p.setAttribute('data-start-slot', connPoint1);
                                p.setAttribute('data-end-slot', connPoint2);
                                $(p).appendTo('#placeholder_defs');

                                // Use for the Line
                                //drawLine(path);
                                // Use for the Line
                                addElement({
                                    format: 'line',
                                    id: 'line_' + path,
                                    color: configuration.line.stroke,
                                    href: '#' + path
                                });

                                // Connect the Element
                                connectElements(path, connElement1, connElement2);
                            }
                            // Remove the connection points
                            showConnectionPoints(false);

                            // Reset the connection init
                            connElement1 = null;
                            connElement2 = null;

                            $("#ex_how_connect").html("Click the button above to connect 2 elements.");
                            $("#connect_elements").val('Connect').removeClass('red');

                            // Remove Listener Handler
                            $(".clickable").off();
                            $('.added_elements').removeClass('clickable').addClass('draggable');
                            $(".all_elements").removeClass('faded_out no_click');
                        }
                    }
                });
                // New Label
                $(this).val('Done').addClass('red');
            } else {
                failedMessage("There are no connectable elements on the surface!<br>Min. 2 rectangle or circles are required!");
            }
        }
    });

    $("#save_workspace").click(function () {
        globalConfigChanged = false;
        // Collect all the things
        let id, tmpConfiguration = {}, elements = {}, defs = {}, lines = {}, animations = {}, icons = {}, datasources = {};
        tmpConfiguration = {
            basic: {
                enable_grid: $('#enable_grid').is(':checked') ? true : false,
                enable_animation: $('#enable_animation').is(':checked') ? true : false,
                enable_area_catch: $('#enable_area_catch').is(':checked') ? true : false,
                height: $('#svg_config').attr('height'),
                width: $('#svg_config').attr('width'),
                styles: $('#own_css').val()
            },
            animation: {},
            animation_configuration: {},
            line: {},
            elements: {},
            defs: {},
            lines: {},
            animations: {},
            icons: {},
            datasources: {}
        };


        if ($('.added_elements').length > 0) {
            // Circles
            $('.type_circle').each(function () {
                id = this.id;
                elements[id] = {
                    type: 'circle',
                    id: id,
                    radius: $(this).attr('r'),
                    pos_x: $(this).attr('cx'),
                    pos_y: $(this).attr('cy'),
                    fill: $(this).css('fill'),
                    color: $(this).css('stroke'),
                    stroke: $(this).css('stroke-width').replace('px', ''),
                    shadow: getShadowColor(id)
                };
            });

            // Rectangles
            $('.type_rect').each(function () {
                id = this.id;
                elements[id] = {
                    type: 'rect',
                    id: id,
                    rx: $(this).attr('rx'),
                    height: $(this).attr('height'),
                    width: $(this).attr('width'),
                    pos_x: $(this).attr('x'),
                    pos_y: $(this).attr('y'),
                    fill: $(this).css('fill'),
                    color: $(this).css('stroke'),
                    stroke: $(this).css('stroke-width').replace('px', ''),
                    shadow: getShadowColor(id)
                };
            });

            // Text
            $('.type_text').each(function () {
                id = this.id;
                elements[id] = {
                    type: 'text',
                    id: id,
                    pos_x: $(this).attr('x'),
                    pos_y: $(this).attr('y'),
                    color: $(this).css('stroke'),
                    fill: $(this).css('fill'),
                    font_family: $(this).css('font-family'),
                    font_size: $(this).css('font-size').replace('px', ''),
                    degree: getRotationDegrees($(this)),
                    text: $(this).html(),
                    shadow: getShadowColor(id)
                }
            });

            // DataSource
            $('.type_datasource').each(function () {
                id = this.id;
                elements[id] = {
                    type: 'text',
                    subType: 'datasource',
                    id: id,
                    pos_x: $(this).attr('x'),
                    pos_y: $(this).attr('y'),
                    color: $(this).css('stroke'),
                    fill: $(this).css('fill'),
                    font_family: $(this).css('font-family'),
                    font_size: $(this).css('font-size').replace('px', ''),
                    degree: getRotationDegrees($(this)),
                    text: "ID " + id,
                    unit: $(this).data('unit'),
                    source: $(this).data('source'),
                    shadow: getShadowColor(id),
                    threshold: $(this).data('threshold') || 0,
                    calculate_kw: $(this).data('calculate_kw') || false,
                    convert: $(this).data('convert') || false,
                    decimal_places: $(this).data('decimal_places') || 0
                }
            });

            // Icons
            $('.type_icon').each(function () {
                id = this.id;
                elements[id] = {
                    type: 'icon',
                    id: id,
                    icon: $(this).data('icon'),
                    width: $(this).data('width'),
                    height: $(this).data('height'),
                    color: $(this).css('color'),
                    pos_x: $(this).attr('x'),
                    pos_y: $(this).attr('y'),
                    shadow: getShadowColor(id)
                }
            });

            // Defs
            $('.type_def').each(function () {
                id = this.id;
                defs[id] = {
                    type: 'def',
                    id: id,
                    d: $(this).attr('d'),
                    startSlot: $(this).data('start-slot'),
                    endSlot: $(this).data('end-slot'),
                }
            });

            // Lines
            $('.type_line').each(function () {
                id = this.id;
                lines[id] = {
                    type: 'line',
                    id: id,
                    href: $(this).attr('xlink:href'),
                    color: $(this).css('stroke')
                }
            });

            // Animations
            $('.type_animation').each(function () {
                id = this.id;
                // Get the Source for Animation
                let tmp = id.split('_');
                let animTmp = new Array();
                animTmp.push(parseInt($('#' + tmp[2]).data('animation')));
                animTmp.push(parseInt($('#' + tmp[3]).data('animation')));
                animations[id] = {
                    type: 'animation',
                    id: id,
                    href: $(this).attr('xlink:href'),
                    color: $(this).css('stroke'),
                    sources: animTmp,
                    threshold: $(this).data('threshold'),
                    animation: $(this).data('animation'),
                    animation_properties: $(this).data('animation_properties'),
                }
            });

            // Datasources
            $(".data-table tbody tr").each(function () {
                id = $(this).data('id');
                datasources[id] = {
                    source: $(this).data('source'),
                    alias: $(this).data('alias')
                }
            });

            // Put all together
            tmpConfiguration.elements = elements;
            tmpConfiguration.animation = configuration.animation;
            tmpConfiguration.animation_configuration = configuration.animation_configuration;
            tmpConfiguration.line = configuration.line;
            tmpConfiguration.defs = defs;
            tmpConfiguration.lines = lines;
            tmpConfiguration.animations = animations;
            tmpConfiguration.datasources = datasources;
            $('#save_output').val(JSON.stringify(tmpConfiguration, undefined, 4));

            // Save the config to ioBroker Object
            if (!localMode) {
                socket.emit('setState', objID[0], { val: JSON.stringify(tmpConfiguration), ack: true }, function (error) {
                    if (error) {
                        console.log(error);
                        failedMessage('An error occured while saving your workspace!');
                    } else {
                        successMessage('Your workspace has been saved successfully');
                    }
                });
            } else {
                successMessage('Local Output of Config!');
            }
        } else {
            failedMessage('You do not have any elements to save!');
        }
    });
});

$(document).ready(function () {
    // Remove active from buttons
    $(".input_button").on("click touchstart", function () {
        this.blur();
    });

    $(window).on('beforeunload', function () {
        if (globalConfigChanged) {
            return "There are unsaved changes. Are you sure to leave now?";
        }
    });

    /* DataSource */
    $("#frm-addDataSource").submit(function (e) {
        e.preventDefault();
        let ds_source = $("#elm_ds_source").val();
        let ds_alias = $("#elm_ds_alias").val() ? $("#elm_ds_alias").val() : '';

        // Get the max data-id


        addDataSourceRow(-1, ds_source, ds_alias);

        $("#elm_ds_source, #elm_ds_alias").val('');
    });

    $(".data-table").on("click", ".btn-delete", function () {
        $(this).parents("tr").fadeOut('fast', function () {
            $(this).remove();
            if ($(".data-table tbody tr").length == 0) {
                // Reshow the No Datasources row
                $(".data-table tbody").append("<tr id='ds_tmp_line' data-id='-1'><td>There are currently no Datasources added!</td><td></td><td></td>");
            }
        });
    });

    $(".data-table").on("click", ".btn-edit", function () {
        let ds_alias = $(this).parents("tr").attr('data-alias');
        let ds_source = $(this).parents("tr").attr('data-source');

        let tableCell1 =
            '<div class="form_div no_margin"><input type="text" class="input_text" name="edit_ds_alias" autocorrect="off" autocomplete="off" value="' + ds_alias + '"></div>';
        let tableCell2 =
            '<div class="form_div no_margin"><input type="text" class="input_text icon_in_input_pad" name="edit_ds_source" autocorrect="off" autocomplete="off" minlength="5" required="" value="' + ds_source + '">' +
            '<div class="icon_wrapper"><a class="datasource tt-element icon_in_input" title="Select Datasource"><span class="iconify" data-icon="mdi:database-search" data-height="24"></span></a></div></div>';
        let tableCell3 =
            "<button class='all_datasource ds_buttons btn-update'><span class='iconify' data-height='24' data-icon='mdi:check'>Update</span></button>" +
            "<button class='all_datasource ds_buttons btn-cancel'><span class='iconify' data-height='24' data-icon='mdi:close'>Close</span></button>";

        $(this).parents("tr").find("td:eq(0)").html(tableCell1);
        $(this).parents("tr").find("td:eq(1)").html(tableCell2);


        $(this).parents("tr").find("td:eq(2)").prepend(tableCell3)
        $(this).hide();
    });

    $(".data-table").on("click", ".btn-cancel", function () {
        let ds_alias = $(this).parents("tr").attr('data-alias');
        let ds_source = $(this).parents("tr").attr('data-source');

        $(this).parents("tr").find("td:eq(0)").text(ds_alias);
        $(this).parents("tr").find("td:eq(1)").text(ds_source);

        $(this).parents("tr").find(".btn-edit").show();
        $(this).parents("tr").find(".btn-update").remove();
        $(this).parents("tr").find(".btn-cancel").remove();
    });

    $(".data-table").on("click", ".btn-update", function () {
        let ds_alias = $(this).parents("tr").find("input[name='edit_ds_alias']").val();
        let ds_source = $(this).parents("tr").find("input[name='edit_ds_source']").val();

        $(this).parents("tr").find("td:eq(0)").text(ds_alias);
        $(this).parents("tr").find("td:eq(1)").text(ds_source);

        $(this).parents("tr").attr('data-alias', ds_alias);
        $(this).parents("tr").attr('data-source', ds_source);

        $(this).parents("tr").find(".btn-edit").show();
        $(this).parents("tr").find(".btn-cancel").remove();
        $(this).parents("tr").find(".btn-update").remove();
    });

    $('body').on("click", ".datasource", function () {
        let id = $(this).parent('div').parent('div').children('input').attr('id');
        console.log(id);
        initSelectId(function (sid) {
            sid.selectId('show', $('#' + id).val(), function (newId) {
                if (newId != $('#' + id).val()) {
                    $('#' + id).val(newId).change();
                    $('#' + id).focus();
                }
            });
        });
    });
    /* Datasource End */

    // Load Config
    loadConfig();
});

function makeDraggable(evt) {
    var svg = evt.target;
    svg.addEventListener('mousedown', startDrag);
    svg.addEventListener('touchstart', startDrag);
    svg.addEventListener('mousemove', drag);
    svg.addEventListener('touchmove', drag);
    svg.addEventListener('mouseup', endDrag);
    svg.addEventListener('touchend', endDrag);
    svg.addEventListener('touchleave', endDrag);
    svg.addEventListener('touchcancel', endDrag);
    //svg.addEventListener('mouseout', endDrag);

    function getMousePosition(evt) {
        var CTM = svg.getScreenCTM();
        // Check, if mobile is active
        if (evt.touches) { evt = evt.touches[0]; }
        return {
            x: parseInt((evt.clientX - CTM.e) / CTM.a),
            y: parseInt((evt.clientY - CTM.f) / CTM.d)
        };
    }

    let selectedElement = null, offset, maxX, maxY, svg_height, svg_width, stroke_width, circle_radius, font_size, connected_elements, reconnect_elements = [], element_moved = false;

    function initDrag(evt) {
        element_moved = false;
        connected_elements = $("path[id*=" + selectedElement.id + "]");
        reconnect_elements = [];
        if (connected_elements.length > 0) {
            //console.log(connected_elements);
            connected_elements.each(function (index) {
                let tmp = connected_elements[index].id.split("_");
                reconnect_elements.push({ "path": connected_elements[index].id, "from": tmp[1], "to": tmp[2] });
            })
        }
        selectedElement.classList.add("dragging");
        offset = getMousePosition(evt);
        svg_height = parseInt(svg.getAttributeNS(null, "height"));
        svg_width = parseInt(svg.getAttributeNS(null, "width"));
        stroke_width = parseInt(selectedElement.style.strokeWidth) / 2;
        circle_radius = parseInt(selectedElement.getAttributeNS(null, "r"));
        font_size = $('#' + selectedElement.id).css('font-size').replace('px', '');

        switch (selectedElement.tagName.toLowerCase()) {
            case 'circle':
                maxX = svg_width - circle_radius - stroke_width;
                maxY = svg_height - circle_radius - stroke_width;
                offset.x -= parseInt(selectedElement.getAttributeNS(null, "cx"));
                offset.y -= parseInt(selectedElement.getAttributeNS(null, "cy"));
                break;
            case 'rect':
                maxX = svg_width - parseInt(selectedElement.getAttributeNS(null, "width")) - stroke_width;
                maxY = svg_height - parseInt(selectedElement.getAttributeNS(null, "height")) - stroke_width;
                offset.x -= parseInt(selectedElement.getAttributeNS(null, "x"));
                offset.y -= parseInt(selectedElement.getAttributeNS(null, "y"));
                break;
            case 'text':
                maxX = svg_width - font_size;
                maxY = svg_height - font_size / 2;
                offset.x -= parseInt(selectedElement.getAttributeNS(null, "x"));
                offset.y -= parseInt(selectedElement.getAttributeNS(null, "y"));
                break;
            case 'svg':
                maxX = svg_width - parseInt(selectedElement.getAttributeNS(null, "width"));
                maxY = svg_height - parseInt(selectedElement.getAttributeNS(null, "height"));
                offset.x -= parseInt(selectedElement.getAttributeNS(null, "x"));
                offset.y -= parseInt(selectedElement.getAttributeNS(null, "y"));
                break;
        }
    }

    function startDrag(evt) {
        if (evt.target.classList.contains('draggable')) {
            selectedElement = evt.target;
        }
        if (evt.target.parentNode.classList.contains('draggable-group')) {
            selectedElement = evt.target.parentNode;
        }
        if (selectedElement) {
            initDrag(evt);
        }
    }

    function drag(evt) {
        if (selectedElement) {
            // Hide Scrollbar on Body and DIV
            //$("body, #svg_preview").addClass("noscroll");

            // Remove Animation
            $('.anim_element').removeClass('animation').addClass('no_animation');

            // Hide Config Bar
            hideConfigBar();
            var coord = getMousePosition(evt);
            element_moved = true;

            switch (selectedElement.tagName.toLowerCase()) {
                case 'circle':
                    if ((coord.x - offset.x - stroke_width) >= circle_radius && (coord.x - offset.x) <= maxX) {
                        selectedElement.setAttributeNS(null, "cx", coord.x - offset.x);
                    }
                    if ((coord.y - offset.y - stroke_width) >= circle_radius && (coord.y - offset.y) <= maxY) {
                        selectedElement.setAttributeNS(null, "cy", coord.y - offset.y);
                    }
                    break;
                case 'rect':
                    if ((coord.x - offset.x - stroke_width) >= 0 && (coord.x - offset.x) <= maxX) {
                        selectedElement.setAttributeNS(null, "x", coord.x - offset.x);
                    }
                    if ((coord.y - offset.y - stroke_width) >= 0 && (coord.y - offset.y) <= maxY) {
                        selectedElement.setAttributeNS(null, "y", coord.y - offset.y);
                    }
                    break;
                case 'text':
                    if ((coord.x - offset.x - font_size) >= 0 && (coord.x - offset.x) <= maxX) {
                        selectedElement.setAttributeNS(null, "x", coord.x - offset.x);
                    }
                    if ((coord.y - offset.y - font_size / 2) >= 0 && (coord.y - offset.y) <= maxY) {
                        selectedElement.setAttributeNS(null, "y", coord.y - offset.y);
                    }
                    break;
                case 'svg':
                    if ((coord.x - offset.x) >= 0 && (coord.x - offset.x) <= maxX) {
                        selectedElement.setAttributeNS(null, "x", coord.x - offset.x);
                    }
                    if ((coord.y - offset.y) >= 0 && (coord.y - offset.y) <= maxY) {
                        selectedElement.setAttributeNS(null, "y", coord.y - offset.y);
                    }
                    break;
            }

            // Update the Line while moving
            if (reconnect_elements) {
                for (var elm of reconnect_elements) {
                    connectElements(elm.path, elm.from, elm.to);
                }
            }
        }
    }

    function endDrag(evt) {
        let animation_timeout = null;
        if (selectedElement != null) {
            selectedElement.classList.remove("dragging");
            //$("body, #svg_preview").removeClass("noscroll");
            animation_timeout = setTimeout(function () {
                if ($('#enable_animation').prop('checked')) {
                    $('.anim_element').removeClass('no_animation').addClass('animation');
                }
            }, 1000);

            // Show Config Bar, whilest Element was not moved
            if (element_moved === false) {
                // Show Config if not moved
                showConfigBar(selectedElement.id, selectedElement.tagName.toLowerCase());
            }
            selectedElement = null;
        }
    }
}