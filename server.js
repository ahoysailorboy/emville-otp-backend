const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

let transporter;

// Initialize Ethereal test account and transporter once at startup
nodemailer.createTestAccount().then(testAccount => {
  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure, // true for 465, false for other ports
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  console.log('Ethereal test account created');
  console.log('User:', testAccount.user);
  console.log('Pass:', testAccount.pass);
}).catch(console.error);

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const otp = generateOTP();

    let info = await transporter.sendMail({
      from: '"Emville PMS" <no-reply@emville.com>',
      to: email,
      subject: 'Your OTP for Emville PMS',
      text: `Your OTP code is: ${otp}`,
    });

    console.log('OTP sent: %s', otp);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

    res.json({
      message: 'OTP sent',
      otp, // for testing, normally do NOT send OTP back in response
      previewUrl: nodemailer.getTestMessageUrl(info),
    });
  } catch (error) {
    console.error('Failed to send OTP', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OTP backend running on port ${PORT}`);
});