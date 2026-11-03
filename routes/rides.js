const express = require("express");

const router = express.Router();


// VEHICLE FARE DETAILS

const VEHICLE_RATES = {

    Bike: {
        baseFare: 20,
        perKmRate: 8
    },

    Auto: {
        baseFare: 30,
        perKmRate: 12
    },

    Cab: {
        baseFare: 50,
        perKmRate: 16
    }

};


// TEMPORARY DEMO DATABASE

let demoRides = [];

let nextRideId = 1;


// STUB AUTHENTICATION

function stubAuth(req, res, next) {

    req.user = {
        id: 1,
        role: "Passenger"
    };

    next();

}


// FARE ESTIMATION FUNCTION

function estimateFare(distanceKm, vehicleType) {

    const rate = VEHICLE_RATES[vehicleType];

    if (
        !rate ||
        !Number.isFinite(Number(distanceKm)) ||
        Number(distanceKm) <= 0
    ) {

        throw new Error(
            "Invalid distance or vehicle type"
        );

    }

    return Math.round(
        rate.baseFare +
        Number(distanceKm) * rate.perKmRate
    );

}


// API 1: GET FARE ESTIMATES

// GET /api/rides/fare-estimate?distanceKm=10

router.get("/fare-estimate", (req, res) => {

    const distanceKm = Number(req.query.distanceKm);

    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {

        return res.status(400).json({

            success: false,

            message: "distanceKm must be greater than 0"

        });

    }

    const data = Object.entries(VEHICLE_RATES).map(
        ([vehicleType, rate]) => ({

            vehicleType,

            baseFare: rate.baseFare,

            perKmRate: rate.perKmRate,

            estimatedFare: estimateFare(
                distanceKm,
                vehicleType
            )

        })
    );

    return res.json({

        success: true,

        message: "Fare estimates calculated",

        data

    });

});


// API 2: CREATE A RIDE

// POST /api/rides

router.post("/", stubAuth, (req, res) => {

    const {

        pickup,
        drop,
        distanceKm,
        vehicleType,
        stops = [],
        scheduledAt = null

    } = req.body;


    if (
        !pickup ||
        !drop ||
        !vehicleType ||
        !Array.isArray(stops)
    ) {

        return res.status(400).json({

            success: false,

            message: "pickup, drop, vehicleType and stops are required"

        });

    }


    let fare;

    try {

        fare = estimateFare(
            distanceKm,
            vehicleType
        );

    } catch (error) {

        return res.status(400).json({

            success: false,

            message: error.message

        });

    }


    const ride = {

        id: nextRideId++,

        passengerId: req.user.id,

        pickup: String(pickup).trim(),

        drop: String(drop).trim(),

        stops: stops.map(String),

        distanceKm: Number(distanceKm),

        vehicleType,

        fare,

        scheduledAt,

        status: scheduledAt ? "Scheduled" : "Pending",

        createdAt: new Date().toISOString()

    };


    demoRides.push(ride);


    return res.status(201).json({

        success: true,

        message: "Ride created successfully",

        data: ride

    });

});


// API 3: GET PASSENGER RIDES

// GET /api/rides

router.get("/", stubAuth, (req, res) => {

    const data = demoRides.filter(

        ride => ride.passengerId === req.user.id

    );


    return res.json({

        success: true,

        message: "Passenger rides fetched",

        data

    });

});


module.exports = router;      