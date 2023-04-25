let localTest = {
    "basic": {
        "enable_grid": true,
        "enable_animation": false,
        "enable_area_catch": true,
        "height": "540",
        "width": "530",
        "styles": "@font-face {\n    font-family: 'montserrat';\n    font-style: normal;\n    src: local('montserrat'),\n        url('/vis/css/montserrat-regular-webfont.woff') format('woff');\n}"
    },
    "animation": {
        "stroke": "#ffce4a",
        "stroke_dasharray": "10 17 10 17 10  72",
        "stroke_width": "6",
        "animation_duration": "2000",
        "stroke_linecap": "round",
        "animation_timing_function": "linear"
    },
    "animation_configuration": {
        "dots": "3",
        "distance": "17",
        "length": "10"
    },
    "line": {
        "stroke_width": "8",
        "stroke": "#000000"
    },
    "elements": {
        "2": {
            "type": "text",
            "subType": "datasource",
            "id": "2",
            "pos_x": "217",
            "pos_y": "43",
            "color": "none",
            "fill": "rgb(255, 206, 74)",
            "font_family": "montserrat",
            "font_size": "18",
            "degree": 0,
            "text": "ID 2",
            "unit": "kW",
            "source": "0",
            "shadow": "",
            "threshold": "0",
            "calculate_kw": true,
            "convert": false,
            "decimal_places": "2"
        },
        "5": {
            "type": "rect",
            "id": "5",
            "rx": "10",
            "height": "100",
            "width": "100",
            "pos_x": "167",
            "pos_y": "2.5",
            "fill": "none",
            "color": "rgb(255, 206, 74)",
            "stroke": "2",
            "shadow": "rgba(0,0,0,0.7)"
        },
        "6": {
            "type": "icon",
            "id": "6",
            "icon": "mdi:solar-panel",
            "width": 24,
            "height": 24,
            "color": "rgba(0, 0, 0, 0.7)",
            "pos_x": "205",
            "pos_y": "6",
            "shadow": ""
        },
        "7": {
            "type": "rect",
            "id": "7",
            "rx": "10",
            "height": "100",
            "width": "100",
            "pos_x": "407",
            "pos_y": "212",
            "fill": "none",
            "color": "rgb(0, 181, 221)",
            "stroke": "2",
            "shadow": "rgba(0,0,0,0.7)"
        },
        "9": {
            "type": "text",
            "subType": "datasource",
            "id": "9",
            "pos_x": "457",
            "pos_y": "254",
            "color": "none",
            "fill": "rgba(0, 181, 221, 0.7)",
            "font_family": "montserrat",
            "font_size": "18",
            "degree": 0,
            "text": "ID 9",
            "unit": "kW",
            "source": 2,
            "shadow": "",
            "threshold": 0,
            "calculate_kw": true,
            "convert": false,
            "decimal_places": 2
        },
        "10": {
            "type": "text",
            "id": "10",
            "pos_x": "217",
            "pos_y": "75",
            "color": "none",
            "fill": "rgba(0, 0, 0, 0.7)",
            "font_family": "montserrat",
            "font_size": "14",
            "degree": 0,
            "text": "Produktion",
            "shadow": ""
        },
        "11": {
            "type": "text",
            "id": "11",
            "pos_x": "457",
            "pos_y": "288",
            "color": "none",
            "fill": "rgba(0, 0, 0, 0.7)",
            "font_family": "montserrat",
            "font_size": "14",
            "degree": 0,
            "text": "Verbrauch",
            "shadow": ""
        },
        "12": {
            "type": "icon",
            "id": "12",
            "icon": "mdi:house-city",
            "width": 24,
            "height": 24,
            "color": "rgba(0, 0, 0, 0.7)",
            "pos_x": "445",
            "pos_y": "218",
            "shadow": ""
        },
        "13": {
            "type": "rect",
            "id": "13",
            "rx": "10",
            "height": "100",
            "width": "100",
            "pos_x": "46",
            "pos_y": "212",
            "fill": "none",
            "color": "rgb(161, 211, 67)",
            "stroke": "2",
            "shadow": "rgba(0,0,0,0.7)"
        },
        "14": {
            "type": "rect",
            "id": "14",
            "rx": "10",
            "height": "100",
            "width": "100",
            "pos_x": "167",
            "pos_y": "422",
            "fill": "none",
            "color": "rgba(97, 104, 122, 0.7)",
            "stroke": "2",
            "shadow": "rgba(0,0,0,0.7)"
        },
        "15": {
            "type": "text",
            "id": "15",
            "pos_x": "96",
            "pos_y": "288",
            "color": "none",
            "fill": "rgba(0, 0, 0, 0.7)",
            "font_family": "montserrat",
            "font_size": "15",
            "degree": 0,
            "text": "Batterie",
            "shadow": ""
        },
        "16": {
            "type": "text",
            "subType": "datasource",
            "id": "16",
            "pos_x": "96",
            "pos_y": "254",
            "color": "none",
            "fill": "rgb(161, 211, 67)",
            "font_family": "\"Arial\", sans-serif",
            "font_size": "20",
            "degree": 0,
            "text": "ID 16",
            "unit": "kW",
            "source": -1,
            "shadow": "",
            "threshold": 1,
            "calculate_kw": true,
            "convert": true,
            "decimal_places": 2
        },
        "18": {
            "type": "text",
            "subType": "datasource",
            "id": "18",
            "pos_x": "96",
            "pos_y": "272",
            "color": "none",
            "fill": "rgb(161, 211, 67)",
            "font_family": "\"Arial\", sans-serif",
            "font_size": "18",
            "degree": 0,
            "text": "ID 18",
            "unit": "%",
            "source": 1,
            "shadow": "",
            "threshold": 0,
            "calculate_kw": false,
            "convert": false,
            "decimal_places": 0
        },
        "19": {
            "type": "text",
            "subType": "datasource",
            "id": "19",
            "pos_x": "217",
            "pos_y": "464",
            "color": "none",
            "fill": "rgb(97, 104, 122)",
            "font_family": "montserrat",
            "font_size": "18",
            "degree": 0,
            "text": "ID 19",
            "unit": "kW",
            "source": "-1",
            "shadow": "",
            "threshold": "0",
            "calculate_kw": true,
            "convert": true,
            "decimal_places": "2"
        },
        "20": {
            "type": "icon",
            "id": "20",
            "icon": "mdi:electricity-from-grid",
            "width": 24,
            "height": 24,
            "color": "rgba(0, 0, 0, 0.7)",
            "pos_x": "205",
            "pos_y": "428",
            "shadow": ""
        },
        "21": {
            "type": "text",
            "id": "21",
            "pos_x": "217",
            "pos_y": "498",
            "color": "none",
            "fill": "rgba(0, 0, 0, 0.7)",
            "font_family": "montserrat",
            "font_size": "14",
            "degree": 0,
            "text": "Netz",
            "shadow": ""
        },
        "22": {
            "type": "rect",
            "id": "22",
            "rx": "10",
            "height": "100",
            "width": "100",
            "pos_x": "407",
            "pos_y": "422",
            "fill": "none",
            "color": "rgb(197, 144, 46)",
            "stroke": "2",
            "shadow": "rgba(0,0,0,0.7)"
        },
        "23": {
            "type": "icon",
            "id": "23",
            "icon": "material-symbols:electric-car",
            "width": 24,
            "height": 24,
            "color": "rgba(0, 0, 0, 0.7)",
            "pos_x": "445",
            "pos_y": "428",
            "shadow": ""
        },
        "24": {
            "type": "text",
            "id": "24",
            "pos_x": "457",
            "pos_y": "498",
            "color": "none",
            "fill": "rgba(0, 0, 0, 0.7)",
            "font_family": "montserrat",
            "font_size": "14",
            "degree": 0,
            "text": "Ioniq",
            "shadow": ""
        }
    },
    "defs": {
        "path_5_7": {
            "type": "def",
            "id": "path_5_7",
            "d": "M237 103  V 124.6 A 15 15 0 0 0 252 139.6  H 422 A 15 15 0 0 1 437 154.6  V 211",
            "startSlot": "bottom_right",
            "endSlot": "top_left"
        },
        "path_5_13": {
            "type": "def",
            "id": "path_5_13",
            "d": "M197 103  V 124.6 A 15 15 0 0 1 182 139.6  H 111 A 15 15 0 0 0 96 154.6  V 211",
            "startSlot": "bottom_left",
            "endSlot": "top"
        },
        "path_14_7": {
            "type": "def",
            "id": "path_14_7",
            "d": "M237 421  V 399.4 A 15 15 0 0 1 252 384.4  H 422 A 15 15 0 0 0 437 369.4  V 313",
            "startSlot": "top_right",
            "endSlot": "bottom_left"
        },
        "path_5_14": {
            "type": "def",
            "id": "path_5_14",
            "d": "M217 103  V 421",
            "startSlot": "bottom",
            "endSlot": "top"
        },
        "path_7_22": {
            "type": "def",
            "id": "path_7_22",
            "d": "M457 313  V 421",
            "startSlot": "bottom",
            "endSlot": "top"
        }
    },
    "lines": {
        "line_path_5_7": {
            "type": "line",
            "id": "line_path_5_7",
            "href": "#path_5_7",
            "color": "rgb(0, 0, 0)"
        },
        "line_path_5_13": {
            "type": "line",
            "id": "line_path_5_13",
            "href": "#path_5_13",
            "color": "rgb(0, 0, 0)"
        },
        "line_path_14_7": {
            "type": "line",
            "id": "line_path_14_7",
            "href": "#path_14_7",
            "color": "rgb(0, 0, 0)"
        },
        "line_path_5_14": {
            "type": "line",
            "id": "line_path_5_14",
            "href": "#path_5_14",
            "color": "rgb(0, 0, 0)"
        },
        "line_path_7_22": {
            "type": "line",
            "id": "line_path_7_22",
            "href": "#path_7_22",
            "color": "rgb(0, 0, 0)"
        }
    },
    "animations": {
        "anim_path_5_7": {
            "type": "animation",
            "id": "anim_path_5_7",
            "href": "#path_5_7",
            "color": "rgb(255, 206, 74)",
            "sources": [
                null,
                null
            ],
            "threshold": 250,
            "animation": 0,
            "animation_properties": "positive"
        },
        "anim_path_5_13": {
            "type": "animation",
            "id": "anim_path_5_13",
            "href": "#path_5_13",
            "color": "rgb(255, 206, 74)",
            "sources": [
                null,
                null
            ],
            "threshold": "undefined",
            "animation": -1,
            "animation_properties": "negative"
        },
        "anim_path_14_7": {
            "type": "animation",
            "id": "anim_path_14_7",
            "href": "#path_14_7",
            "color": "rgb(255, 206, 74)",
            "sources": [
                null,
                null
            ],
            "threshold": "undefined",
            "animation": -1,
            "animation_properties": "negative"
        },
        "anim_path_5_14": {
            "type": "animation",
            "id": "anim_path_5_14",
            "href": "#path_5_14",
            "color": "rgb(255, 206, 74)",
            "sources": [
                null,
                null
            ],
            "threshold": "undefined",
            "animation": 0,
            "animation_properties": "positive"
        },
        "anim_path_7_22": {
            "type": "animation",
            "id": "anim_path_7_22",
            "href": "#path_7_22",
            "color": "rgb(255, 206, 74)",
            "sources": [
                null,
                null
            ],
            "threshold": 0,
            "animation": "",
            "animation_properties": "positive"
        }
    },
    "icons": {},
    "datasources": {
        "0": {
            "source": "sonnen.0.status.production",
            "alias": "Production"
        },
        "1": {
            "source": "sonnen.0.status.userSoc",
            "alias": "Battery-%"
        },
        "2": {
            "source": "sonnen.0.status.consumption",
            "alias": "Consumption"
        }
    }
}