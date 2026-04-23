import nodemailer from 'nodemailer';


export const sendEmail = async ({ to, subject,html }:{to:string,subject:string,html:string}) => {
      const trasporter = nodemailer.createTransport({
          host:process.env.HOST,
          port:Number(process.env.EMAIL_PORT),
          secure:false,
          auth: {
              user: process.env.EMAIL,
              pass: process.env.PASSWORD
          }
      })

      const main = async()=>{
        const info = await trasporter.sendMail({
        from :`Tadreebak<${process.env.EMAIL}>`,
        to:to,
        subject:subject,
        html:html
        })
      }
      main().catch(console.error) 
}