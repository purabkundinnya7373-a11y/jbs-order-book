const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

admin.initializeApp();

// Configuration
const SENDGRID_KEY = functions.config().sendgrid?.key;
const TWILIO_SID = functions.config().twilio?.sid;
const TWILIO_TOKEN = functions.config().twilio?.token;
const TWILIO_PHONE = functions.config().twilio?.phone || "+1234567890"; // Fallback or config

if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

/**
 * Triggered when a reservation document is updated.
 * Sends notifications if the status changes to "Confirmed".
 */
exports.onReservationConfirmed = functions.firestore
    .document("reservations/{reservationId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        console.log(`Checking status change for ${context.params.reservationId}`);
        console.log("Before:", before.status);
        console.log("After:", after.status);

        // Only fire if status changes FROM anything TO "Confirmed"
        if (before.status !== "Confirmed" && after.status === "Confirmed") {
            console.log("Reservation confirmed. Triggering notifications.");

            const res = {
                id: context.params.reservationId,
                name: after.name,
                email: after.email,
                phone: after.phone,
                date: after.date,
                time: after.time,
                guests: after.guests
            };

            try {
                const emailPromise = sendConfirmationEmail(res);
                const smsPromise = sendConfirmationSMS(res);

                await Promise.all([emailPromise, smsPromise]);

                console.log("All notifications sent successfully.");
            } catch (error) {
                console.error("Notification delivery error:", error);
            }
        }
        return null;
    });

/**
 * Sends a branded HTML email via SendGrid
 */
async function sendConfirmationEmail(res) {
    if (!SENDGRID_KEY) {
        console.warn("SendGrid key not configured. Skipping email.");
        return;
    }

    const msg = {
        to: res.email,
        from: "reservations@jbsrestaurant.com", // Replace with verified sender
        subject: "Reservation Confirmed - JB's Restaurant",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
          <div style="background: #1a2a44; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Reservation Confirmed</h1>
          </div>
          <div style="padding: 40px; color: #333; line-height: 1.6;">
              <p>Hello <strong>${res.name}</strong>,</p>
              <p>Great news! Your table at <strong>JB's Restaurant</strong> has been confirmed.</p>
              
              <div style="background: #f8f9fa; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0;">
                  <p style="margin: 0; font-size: 14px; color: #666;">BOOKING ID: <strong>${res.id}</strong></p>
                  <p style="margin: 5px 0;">📅 Date: <strong>${res.date}</strong></p>
                  <p style="margin: 5px 0;">⏰ Time: <strong>${res.time}</strong></p>
                  <p style="margin: 5px 0;">👥 Guests: <strong>${res.guests}</strong></p>
              </div>

              <p style="font-size: 14px;">📍 <strong>Location:</strong> GS Rd, Ganeshguri, Guwahati, Assam 781005</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
              <small style="color: #999;">If you need to cancel, please call +91 361 223 4567.</small>
          </div>
      </div>
    `,
    };

    try {
        await sgMail.send(msg);
        console.log(`Email sent to ${res.email}`);
    } catch (error) {
        console.error("SendGrid Error:", error.response ? error.response.body : error);
        throw error;
    }
}

/**
 * Sends a transactional SMS via Twilio
 */
async function sendConfirmationSMS(res) {
    if (!TWILIO_SID || !TWILIO_TOKEN) {
        console.warn("Twilio credentials not configured. Skipping SMS.");
        return;
    }

    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    const body = `Hello ${res.name}, your table for ${res.guests} on ${res.date} at ${res.time} is confirmed! JB's Restaurant`;

    try {
        await client.messages.create({
            body: body,
            from: TWILIO_PHONE,
            to: res.phone // Ensure phone is in E.164 format
        });
        console.log(`SMS sent to ${res.phone}`);
    } catch (error) {
        console.error("Twilio Error:", error);
        throw error;
    }
}
