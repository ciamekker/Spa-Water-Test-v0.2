window.PEUGEOT_E2008_DB = {
  "name": "Peugeot e-2008 / e-CMP 2020 starter diagnostic database",
  "version": "1.0.0",
  "vehicle": {
    "make": "Peugeot",
    "model": "e-2008",
    "platform": "e-CMP",
    "model_year_basis": 2020,
    "notes": "Starterprofil basert på åpen reverse-engineering for PSA/Stellantis e-CMP/e-208. Verifiser alltid mot egen bil."
  },
  "bus": {
    "protocol": "ISO 15765-4 CAN",
    "can_id_format": "11-bit",
    "bitrate": 500000,
    "elm_protocol": 6
  },
  "ecus": [
    {
      "key": "vcu",
      "name": "VCU / drivlinje",
      "request_id": "6A2",
      "response_id": "682",
      "setup": [
        "ATSH6A2",
        "ATFCSH6A2",
        "ATCRA682"
      ],
      "signals": [
        {
          "did": "D402",
          "command": "22D4021",
          "name": "Hastighet",
          "unit": "km/t",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.00794,
          "add": 0,
          "min": 0,
          "max": 220
        },
        {
          "did": "D8EF",
          "command": "22D8EF1",
          "name": "Utetemperatur",
          "unit": "°C",
          "kind": "u8",
          "offset": 0,
          "factor": 1,
          "add": 0,
          "min": -40,
          "max": 60
        },
        {
          "did": "D8CF",
          "command": "22D8CF1",
          "name": "Motor turtall foran",
          "unit": "rpm",
          "kind": "u16be",
          "offset": 0,
          "factor": 1,
          "add": 0,
          "min": 0,
          "max": 18000
        }
      ]
    },
    {
      "key": "bms",
      "name": "TBMU / BMS",
      "request_id": "6B4",
      "response_id": "694",
      "setup": [
        "ATSH6B4",
        "ATFCSH6B4",
        "ATCRA694"
      ],
      "signals": [
        {
          "did": "D410",
          "command": "22D4101",
          "name": "SOC",
          "unit": "%",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.001953125,
          "add": 0,
          "min": 0,
          "max": 100
        },
        {
          "did": "D816",
          "command": "22D8161",
          "name": "HV batteristrøm",
          "unit": "A",
          "kind": "custom",
          "formula": "(76800 - raw_u32be) * 0.018",
          "offset": 0,
          "length": 4,
          "min": -500,
          "max": 500,
          "note": "Fortegn følger kilden: lading/regen positiv, kjøring negativ."
        },
        {
          "did": "D815",
          "command": "22D8151",
          "name": "HV batterispenning",
          "unit": "V",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.0625,
          "add": 0,
          "min": 200,
          "max": 470
        },
        {
          "did": "D86F",
          "command": "22D86F1",
          "name": "Laveste cellespenning",
          "unit": "V",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.001,
          "add": 0,
          "min": 2.5,
          "max": 4.4
        },
        {
          "did": "D870",
          "command": "22D8701",
          "name": "Høyeste cellespenning",
          "unit": "V",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.001,
          "add": 0,
          "min": 2.5,
          "max": 4.4
        },
        {
          "did": "D43C",
          "command": "22D43C1",
          "name": "Celle nr. med lavest spenning",
          "unit": "#",
          "kind": "u8",
          "offset": 0,
          "factor": 1,
          "add": 1,
          "min": 1,
          "max": 108
        },
        {
          "did": "D860",
          "command": "22D8601",
          "name": "SOH (gjennomsnitt/fallback)",
          "unit": "%",
          "kind": "u16be",
          "offset": 1,
          "factor": 0.0625,
          "add": 0,
          "min": 0,
          "max": 100,
          "note": "Dekoder bruker byte 1-2 i nyttelasten etter DID."
        },
        {
          "did": "D865",
          "command": "22D8651",
          "name": "Tilgjengelig energi",
          "unit": "kWh",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.015625,
          "add": 0,
          "min": 0,
          "max": 60
        },
        {
          "did": "D822",
          "command": "22D8221",
          "name": "12 V systemspenning",
          "unit": "V",
          "kind": "u16be",
          "offset": 0,
          "factor": 0.001,
          "add": 0,
          "min": 8,
          "max": 16
        },
        {
          "did": "D871",
          "command": "22D8711",
          "name": "Maks lade-/regen-effekt",
          "unit": "kW",
          "kind": "u32be",
          "offset": 0,
          "factor": 0.001,
          "add": 0,
          "min": 0,
          "max": 600
        },
        {
          "did": "D873",
          "command": "22D8731",
          "name": "Maks utladningseffekt",
          "unit": "kW",
          "kind": "u32be",
          "offset": 0,
          "factor": 0.001,
          "add": 0,
          "min": 0,
          "max": 600
        },
        {
          "did": "D87B",
          "command": "22D87B1",
          "name": "HV isolasjon +",
          "unit": "kΩ",
          "kind": "u32be",
          "offset": 0,
          "factor": 1,
          "add": 0,
          "min": 0,
          "max": 100000
        },
        {
          "did": "D87C",
          "command": "22D87C1",
          "name": "HV isolasjon −",
          "unit": "kΩ",
          "kind": "u32be",
          "offset": 0,
          "factor": 1,
          "add": 0,
          "min": 0,
          "max": 100000
        },
        {
          "did": "D87D",
          "command": "22D87D1",
          "name": "Batteritemperatur min",
          "unit": "°C",
          "kind": "u8",
          "offset": 0,
          "factor": 1,
          "add": -40,
          "min": -40,
          "max": 90
        },
        {
          "did": "D877",
          "command": "22D8771",
          "name": "Batteritemperatur",
          "unit": "°C",
          "kind": "u8",
          "offset": 0,
          "factor": 1,
          "add": -40,
          "min": -40,
          "max": 90
        },
        {
          "did": "D878",
          "command": "22D8781",
          "name": "Batteri temperaturdelta",
          "unit": "°C",
          "kind": "u8",
          "offset": 0,
          "factor": 1,
          "add": 0,
          "min": 0,
          "max": 60
        },
        {
          "did": "D440",
          "command": "22D4401",
          "name": "108 cellespenninger",
          "unit": "V",
          "kind": "array_u16be",
          "offset": 0,
          "count": 108,
          "factor": 0.001,
          "add": 0,
          "min": 2.5,
          "max": 4.4
        },
        {
          "did": "D442",
          "command": "22D4421",
          "name": "54 batteritemperaturpunkter",
          "unit": "°C",
          "kind": "array_u8",
          "offset": 0,
          "count": 54,
          "factor": 1,
          "add": -40,
          "min": -40,
          "max": 90
        },
        {
          "did": "D426",
          "command": "22D4261",
          "name": "SOH svakeste blokk",
          "unit": "%",
          "kind": "array_min_u16be",
          "offset": 0,
          "factor": 0.0625,
          "add": 0,
          "min": 50,
          "max": 110,
          "note": "Verdier 100–110 % kan forekomme; originaldekoder klamper disse til 100 % før minimum velges."
        }
      ]
    },
    {
      "key": "charger",
      "name": "OBC / DC-DC",
      "request_id": "590",
      "response_id": "58F",
      "setup": [
        "ATSH590",
        "ATFCSH590",
        "ATCRA58F"
      ],
      "signals": [
        {
          "did": "D854",
          "command": "22D8541",
          "name": "Lading aktiv",
          "unit": "",
          "kind": "bool_u8_gt0",
          "offset": 0
        }
      ]
    },
    {
      "key": "obd",
      "name": "OBD-II broadcast",
      "request_id": "7DF",
      "response_id": "7E8",
      "setup": [
        "ATSH7DF",
        "ATCRA7E8"
      ],
      "signals": [
        {
          "did": "0902",
          "command": "0902",
          "name": "VIN",
          "unit": "",
          "kind": "vin_mode09"
        }
      ]
    }
  ],
  "derived": [
    {
      "name": "HV effekt",
      "unit": "kW",
      "formula": "HV batteristrøm * HV batterispenning / 1000"
    },
    {
      "name": "Celle-delta",
      "unit": "mV",
      "formula": "(Høyeste cellespenning - Laveste cellespenning) * 1000"
    }
  ],
  "warnings": [
    "Kun lesing er implementert. Ingen UDS write/routine-control/security-access.",
    "Ikke stol på en verdi før den er verifisert på bilen.",
    "Bluetooth Classic via Web Serial krever kompatibel Chrome/Chromium og HTTPS/localhost."
  ]
};
