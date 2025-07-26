const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// In-memory OTP store (not suitable for production)
const otpStore = {};

app.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('Email is required');

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[email] = otp;

  try {
    // Create Gmail transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'shallow.waters22@gmail.com',            // 👈 Replace with your Gmail
        pass: 'akceflfqqkjgmbjn'          // 👈 Replace with Gmail App Password
      }
    });

    const mailOptions = {
      from: 'shallow.waters22@gmail.com',
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${otp}`);
    res.status(200).send('OTP sent successfully');
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).send('Failed to send OTP');
  }
});

app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).send('Missing email or OTP');

  if (otpStore[email] === otp) {
    delete otpStore[email]; // Remove used OTP
    return res.status(200).send('OTP verified successfully');
  } else {
    return res.status(400).send('Invalid OTP');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});