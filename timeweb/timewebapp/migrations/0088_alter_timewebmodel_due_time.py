# Generated by Django 3.2.7 on 2021-11-13 21:38

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0087_timewebmodel_due_time'),
    ]

    operations = [
        migrations.AlterField(
            model_name='timewebmodel',
            name='due_time',
            field=models.TimeField(blank=True, null=True, verbose_name=' '),
        ),
    ]