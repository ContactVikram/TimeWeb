# Generated by Django 3.1.8 on 2021-04-17 19:09

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0016_auto_20210417_1206'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='settingsmodel',
            name='first_visit',
        ),
    ]