const { BasicStrategy } = require("passport-http");
const passport = require("passport");
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

if (!process.env.RMQSTRING) throw `No RabbitMQ Connection String`;
const RMQSTRING = process.env.RMQSTRING;
if (!process.env.QUEUE) throw `No Queue to listen to`;
const QUEUE = process.env.QUEUE;

if (!process.env.AUTHUSER) throw `No AUTHUSER string`;
const AUTHUSER = process.env.AUTHUSER;
if (!process.env.AUTHPASSWORD) throw `No AUTHPASSWORD string`;
const AUTHPASSWORD = process.env.AUTHPASSWORD;

passport.use(
  new BasicStrategy((user, pw, done) => {
    try {
      if (user !== AUTHUSER) return done(null, false);
      if (pw !== AUTHPASSWORD) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

function generateUuid() {
  return (
    Math.random().toString() +
    Math.random().toString() +
    Math.random().toString()
  );
}

const amqp = require("amqplib/callback_api");
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");

const app = express();
app.use(cors());
app.use(morgan("[:date] :method :url :status - :response-time ms"));

app.get(
  "/:vin",
  passport.authenticate("basic", { session: false }),
  (req, res) => {
    const vin = req.params.vin;
    if (!/\w{17}/.test(vin)) {
      res.status(400).json({
        success: false,
        error: "Not a valid VIN",
      });
      return;
    }
    amqp.connect(RMQSTRING, function (error0, connection) {
      if (error0) {
        throw error0;
      }
      connection.createChannel(function (error1, channel) {
        if (error1) {
          throw error1;
        }
        channel.assertQueue(
          "",
          {
            exclusive: true,
          },
          function (error2, q) {
            if (error2) {
              throw error2;
            }
            var correlationId = generateUuid();
            let query = vin;

            console.log(" [x] Requesting backend info", query);

            channel.consume(
              q.queue,
              function (msg) {
                if (msg.properties.correlationId == correlationId) {
                  const c = JSON.parse(msg.content.toString());

                  if (!c.vin) {
                    res.status(404).json({
                      success: false,
                      error: "Not found",
                    });
                    return;
                  }

                  setTimeout(function () {
                    connection.close();
                    res.json({ success: true, status: c });
                  }, 500);
                }
              },
              {
                noAck: true,
              }
            );

            channel.sendToQueue(QUEUE, Buffer.from(query), {
              correlationId: correlationId,
              replyTo: q.queue,
            });
          }
        );
      });
    });
  }
);

app.listen(3333, () => console.log(`App listening on port 3333`));
