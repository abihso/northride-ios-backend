import { Infobip, AuthType } from "@infobip-api/sdk";

const infobip = new Infobip({
    baseUrl: process.env.INFIBIP_BASE_URL || "8vn9d9.api.infobip.com",
    authType: AuthType.ApiKey,
    apiKey: process.env.INFIBIP_API_KEY,
});

async function sendSms({ to, text }) {
    console.log(text, to);
    try {
        const response = await infobip.channels.sms.send({
            messages: [
                {
                    destinations: [{ to }], 
                    from: "NorthRide", 
                    text: text  ,
                },
            ],
        });

    } catch (error) {
        console.error("Error sending message:", error);
    }
}

export default sendSms;